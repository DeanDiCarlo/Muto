'use server'

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth'

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const getOrCreateChatSessionSchema = z.object({
  instanceId: z.string().uuid(),
  labId: z.string().uuid(),
})

const sendChatMessageSchema = z.object({
  sessionId: z.string().uuid(),
  content: z.string().min(1, 'Message cannot be empty').max(4000),
})

// ---------------------------------------------------------------------------
// Rate limit stub
// TODO: wire real rate limit (50/hour, 300/day per user)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function checkChatRateLimit(_userId: string): Promise<{ allowed: boolean; resetsAt?: Date }> {
  return { allowed: true }
}

// ---------------------------------------------------------------------------
// getOrCreateChatSession
// ---------------------------------------------------------------------------

export async function getOrCreateChatSession(input: { instanceId: string; labId: string }) {
  try {
    const parsed = getOrCreateChatSessionSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false as const, error: parsed.error.issues[0].message }
    }

    const user = await getCurrentUser()
    if (!user) return { success: false as const, error: 'Unauthorized' }

    const admin = createAdminClient()
    const { instanceId, labId } = parsed.data

    // Verify enrollment
    const { data: enrollment, error: enrollErr } = await admin
      .from('enrollments')
      .select('id')
      .eq('course_instance_id', instanceId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (enrollErr || !enrollment) {
      return { success: false as const, error: 'Not enrolled in this course' }
    }

    // Find or create chat session
    const { data: existing } = await admin
      .from('chat_sessions')
      .select('id')
      .eq('enrollment_id', enrollment.id)
      .eq('lab_id', labId)
      .maybeSingle()

    let sessionId: string

    if (existing) {
      sessionId = existing.id
    } else {
      const { data: newSession, error: insertErr } = await admin
        .from('chat_sessions')
        .insert({ lab_id: labId, enrollment_id: enrollment.id })
        .select('id')
        .single()

      if (insertErr || !newSession) {
        return { success: false as const, error: insertErr?.message ?? 'Failed to create session' }
      }
      sessionId = newSession.id
    }

    // Fetch message history
    const { data: messages, error: msgErr } = await admin
      .from('chat_messages')
      .select('id, role, content, created_at')
      .eq('chat_session_id', sessionId)
      .order('created_at', { ascending: true })

    if (msgErr) {
      return { success: false as const, error: msgErr.message }
    }

    return {
      success: true as const,
      sessionId,
      messages: (messages ?? []).map((m) => ({
        id: m.id,
        role: m.role as 'student' | 'assistant',
        content: m.content,
        created_at: m.created_at,
      })),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false as const, error: message }
  }
}

// ---------------------------------------------------------------------------
// sendChatMessage
// ---------------------------------------------------------------------------

export async function sendChatMessage(input: { sessionId: string; content: string }) {
  try {
    const parsed = sendChatMessageSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false as const, error: parsed.error.issues[0].message }
    }

    const user = await getCurrentUser()
    if (!user) return { success: false as const, error: 'Unauthorized' }

    const admin = createAdminClient()
    const { sessionId, content } = parsed.data

    // Rate limit check
    const { allowed, resetsAt } = await checkChatRateLimit(user.id)
    if (!allowed) {
      const resetTime = resetsAt ? resetsAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'soon'
      return {
        success: false as const,
        error: `RATE_LIMIT: You've reached your hourly chat limit. Resets at ${resetTime}.`,
      }
    }

    // Verify session belongs to current user
    const { data: session, error: sessErr } = await admin
      .from('chat_sessions')
      .select('id, enrollment_id, enrollments!inner(user_id)')
      .eq('id', sessionId)
      .single()

    if (sessErr || !session) {
      return { success: false as const, error: 'Session not found' }
    }

    type SessionRow = typeof session & { enrollments: { user_id: string } }
    const sess = session as unknown as SessionRow
    if (sess.enrollments.user_id !== user.id) {
      return { success: false as const, error: 'Unauthorized' }
    }

    // Insert student message
    const { data: userMsg, error: userMsgErr } = await admin
      .from('chat_messages')
      .insert({ chat_session_id: sessionId, role: 'student', content })
      .select('id, role, content, created_at')
      .single()

    if (userMsgErr || !userMsg) {
      return { success: false as const, error: userMsgErr?.message ?? 'Failed to send message' }
    }

    // Update session last_message_at
    await admin
      .from('chat_sessions')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', sessionId)

    // Stub assistant response after delay
    // TODO: replace with RAG via content_embeddings (separate sprint)
    await new Promise((resolve) => setTimeout(resolve, 500))

    const { data: assistantMsg, error: assistantErr } = await admin
      .from('chat_messages')
      .insert({
        chat_session_id: sessionId,
        role: 'assistant',
        content: 'RAG-based responses coming soon. Your message was logged.',
      })
      .select('id, role, content, created_at')
      .single()

    if (assistantErr || !assistantMsg) {
      return { success: false as const, error: assistantErr?.message ?? 'Failed to get response' }
    }

    await admin
      .from('chat_sessions')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', sessionId)

    return {
      success: true as const,
      userMessage: {
        id: userMsg.id,
        role: userMsg.role as 'student',
        content: userMsg.content,
        created_at: userMsg.created_at,
      },
      assistantMessage: {
        id: assistantMsg.id,
        role: assistantMsg.role as 'assistant',
        content: assistantMsg.content,
        created_at: assistantMsg.created_at,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false as const, error: message }
  }
}
