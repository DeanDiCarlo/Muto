#!/usr/bin/env node
// =============================================================================
// E2E pipeline test: Course creation → Material upload → Parse → Plan → Lab gen
//
// Uses the Supabase admin client directly (same credentials as the app) to
// simulate the full professor flow without needing a browser/cookie. The worker
// process must be running separately (`cd worker && npm run dev`).
//
// Usage:  node scripts/test-pipeline.mjs
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// Config — read from .env.local the same way the app does
// ---------------------------------------------------------------------------

function loadEnv() {
  const envPath = resolve(__dirname, '..', '.env.local')
  const lines = readFileSync(envPath, 'utf-8').split('\n')
  const env = {}
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) env[match[1].trim()] = match[2].trim()
  }
  return env
}

const env = loadEnv()
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function waitForJobCompletion(jobId, label, timeoutMs = 120_000) {
  const start = Date.now()
  process.stdout.write(`   ⏳ Waiting for ${label} (job ${jobId.slice(0, 8)})...`)

  while (Date.now() - start < timeoutMs) {
    const { data } = await supabase
      .from('generation_jobs')
      .select('status, progress_percent, current_step, error_message')
      .eq('id', jobId)
      .single()

    if (!data) {
      process.stdout.write(' ❌ Job not found\n')
      return null
    }

    if (data.status === 'complete') {
      process.stdout.write(` ✅ (${((Date.now() - start) / 1000).toFixed(1)}s)\n`)
      return data
    }

    if (data.status === 'failed') {
      process.stdout.write(` ❌ FAILED: ${data.error_message}\n`)
      return data
    }

    // Show progress
    const pct = data.progress_percent ?? 0
    const step = data.current_step ?? ''
    process.stdout.write(`\r   ⏳ ${label}: ${pct}% ${step}`.padEnd(80))

    await new Promise((r) => setTimeout(r, 2000))
  }

  process.stdout.write(` ❌ TIMEOUT after ${timeoutMs / 1000}s\n`)
  return null
}

// ---------------------------------------------------------------------------
// STEP 1: Find professor user
// ---------------------------------------------------------------------------

async function findProfessor() {
  console.log('\n━━━ STEP 1: Finding professor user ━━━')
  const { data: users, error } = await supabase
    .from('users')
    .select('id, email, full_name, role, institution_id')
    .eq('role', 'professor')
    .limit(1)

  if (error || !users?.length) {
    console.error('❌ No professor user found. Run seed first.')
    process.exit(1)
  }

  const prof = users[0]
  console.log(`   ✅ Professor: ${prof.full_name} (${prof.email})`)
  console.log(`   Institution: ${prof.institution_id}`)
  return prof
}

// ---------------------------------------------------------------------------
// STEP 2: Create course
// ---------------------------------------------------------------------------

async function createCourse(prof) {
  console.log('\n━━━ STEP 2: Creating course ━━━')
  const title = 'Intro to Artificial Intelligence'
  const subjectArea = 'computer_science'
  const description = 'An introductory course covering fundamental AI concepts including neural networks, convolutional architectures, and deep learning.'

  // Insert with pending slug, then update (mirrors the app's createCourse action)
  const { data: inserted, error: insertErr } = await supabase
    .from('courses')
    .insert({
      institution_id: prof.institution_id,
      created_by: prof.id,
      title,
      slug: 'pending',
      subject_area: subjectArea,
      description,
    })
    .select('id')
    .single()

  if (insertErr) {
    console.error('❌ Failed to create course:', insertErr.message)
    process.exit(1)
  }

  const slug = `${slugify(title)}-${inserted.id.slice(0, 6)}`
  await supabase.from('courses').update({ slug }).eq('id', inserted.id)

  console.log(`   ✅ Course created: "${title}"`)
  console.log(`   ID:   ${inserted.id}`)
  console.log(`   Slug: ${slug}`)
  console.log(`   URL:  /professor/courses/${slug}`)
  return { id: inserted.id, slug, title }
}

// ---------------------------------------------------------------------------
// STEP 3: Upload synthetic source material (skip actual PDF, create content blocks directly)
// ---------------------------------------------------------------------------

async function uploadMaterial(course, prof) {
  console.log('\n━━━ STEP 3: Creating source material + content blocks ━━━')
  console.log('   (Bypassing PDF upload — inserting parsed content directly)')

  // Create a source_materials row (simulating an uploaded PDF)
  const { data: material, error: matErr } = await supabase
    .from('source_materials')
    .insert({
      course_id: course.id,
      uploaded_by: prof.id,
      file_name: 'cnn-architecture-notes.pdf',
      file_type: 'application/pdf',
      storage_path: `${course.id}/test/cnn-architecture-notes.pdf`,
      file_size_bytes: 245760,
    })
    .select('id')
    .single()

  if (matErr) {
    console.error('❌ Failed to create material:', matErr.message)
    process.exit(1)
  }

  console.log(`   ✅ Material row created: ${material.id.slice(0, 8)}`)

  // Insert rich content blocks that the plan proposer will use
  const blocks = [
    {
      source_material_id: material.id,
      block_type: 'paragraph',
      position: 0,
      content: `# Convolutional Neural Networks (CNNs): Architecture and Nuances

## 1. Motivation and History
Convolutional Neural Networks (CNNs) are a class of deep neural networks most commonly applied to analyzing visual imagery. The architecture was inspired by the organization of the animal visual cortex: individual neurons respond to stimuli in a restricted region of the visual field known as the receptive field. The LeNet architecture (Yann LeCun, 1998) was one of the first successful CNNs and was used for handwritten digit recognition.

## 2. Core Building Blocks

### 2.1 Convolutional Layers
The fundamental building block of a CNN is the convolutional layer. A convolution operation applies a learnable kernel (filter) across the input to produce a feature map. Key parameters:
- **Kernel size**: Typically 3×3 or 5×5. Smaller kernels are preferred (VGGNet insight).
- **Stride**: The step size of the kernel. Stride > 1 can be used instead of pooling for downsampling.
- **Padding**: 'same' padding preserves spatial dimensions; 'valid' reduces them.
- **Number of filters**: Determines the depth of the output feature map.

The output size formula: O = (W - K + 2P) / S + 1, where W = input size, K = kernel size, P = padding, S = stride.

### 2.2 Activation Functions
After each convolution, a non-linear activation is applied:
- **ReLU** (f(x) = max(0, x)): Most common. Fast, avoids vanishing gradients, but can cause "dying ReLU" problem.
- **Leaky ReLU**: f(x) = x if x > 0, else αx (α ≈ 0.01). Addresses dying ReLU.
- **GELU**: Gaussian Error Linear Unit, used in modern architectures (ViT, BERT adaptations).

### 2.3 Pooling Layers
Pool over spatial regions to reduce resolution:
- **Max Pooling**: Selects maximum value in each window (2×2 typical). Provides translation invariance.
- **Average Pooling**: Computes the mean. Used in final layers of modern architectures (Global Average Pooling).
- **Strided Convolutions**: An alternative to explicit pooling (used in ResNet and later architectures).

### 2.4 Fully Connected Layers
At the end of the feature extraction pipeline, feature maps are flattened and passed through one or more dense (fully connected) layers for classification. Modern trend: replace FC layers with Global Average Pooling (GAP) to reduce parameters.`,
      page_number: 1,
    },
    {
      source_material_id: material.id,
      block_type: 'paragraph',
      position: 1,
      content: `## 3. Landmark Architectures

### 3.1 AlexNet (2012)
- Won ImageNet with 16.4% top-5 error (vs 26% for runner-up)
- 5 conv layers + 3 FC layers, 60M parameters
- Key innovations: ReLU activation, dropout regularization, data augmentation, GPU training
- Nuance: used overlapping pooling (3×3 pool, stride 2)

### 3.2 VGGNet (2014)
- Showed that depth matters: 16-19 layers using only 3×3 convolutions
- Insight: stacking two 3×3 convolutions gives the same effective receptive field as one 5×5, with fewer parameters and more non-linearity
- 138M parameters — very memory intensive

### 3.3 GoogLeNet / Inception (2014)
- Introduced the "Inception module": parallel branches with 1×1, 3×3, 5×5 convolutions and 3×3 max pooling, concatenated along the channel dimension
- 1×1 convolutions serve as "bottleneck" layers to reduce channel dimensionality before expensive operations
- Only 5M parameters — much more efficient than VGG

### 3.4 ResNet (2015)
- Introduced skip connections (residual learning): the output of a block is F(x) + x
- Solved the degradation problem: deeper networks no longer underperform shallower ones
- Enabled training of 152+ layer networks
- Nuance: "pre-activation ResNet" (BN→ReLU→Conv vs Conv→BN→ReLU) gives better gradient flow

### 3.5 DenseNet (2017)
- Each layer receives feature maps from ALL preceding layers (dense connections)
- Encourages feature reuse, reduces parameters vs ResNet
- Growth rate parameter controls how many new feature maps each layer adds

## 4. Critical Nuances and Design Decisions

### 4.1 Receptive Field
The receptive field is the region of the input that influences a particular feature. Deeper networks have larger receptive fields. Understanding this is critical for choosing architecture depth for your task:
- Small objects / fine details → need high resolution feature maps
- Large-scale patterns → need large receptive fields

### 4.2 Batch Normalization
Normalizes activations within each mini-batch. Placed after convolution (or before activation in pre-activation variants). Benefits: faster training, acts as regularizer, allows higher learning rates. Nuance: behavior differs between training (uses batch stats) and inference (uses running mean/variance).

### 4.3 1×1 Convolutions
Despite the name, 1×1 convolutions are powerful:
- Cross-channel feature mixing (like a per-pixel fully connected layer)
- Channel dimension reduction/expansion ("bottleneck")
- Adding non-linearity without changing spatial resolution
- Used extensively in Inception, ResNet bottleneck, and MobileNet

### 4.4 Depthwise Separable Convolutions
Factorize a standard convolution into: (1) depthwise convolution (one filter per input channel) + (2) pointwise 1×1 convolution. Reduces computation by a factor of ~K² (where K is the kernel size). Used in MobileNet, EfficientNet, Xception.

### 4.5 Transfer Learning
Pre-trained CNN features (e.g., ImageNet weights) transfer remarkably well to new tasks. Strategy:
- Freeze early layers (generic edge/texture detectors)
- Fine-tune later layers (task-specific features)
- Replace the final classifier head for your specific number of classes
- Use a smaller learning rate for pre-trained layers`,
      page_number: 2,
    },
  ]

  for (const block of blocks) {
    const { error } = await supabase.from('content_blocks').insert(block)
    if (error) {
      console.error(`❌ Failed to insert content block: ${error.message}`)
      process.exit(1)
    }
  }

  console.log(`   ✅ ${blocks.length} content blocks inserted (CNN architecture notes)`)

  // Mark the parse job as complete (so the UI doesn't show "parsing...")
  const { data: job } = await supabase
    .from('generation_jobs')
    .insert({
      course_id: course.id,
      created_by: prof.id,
      job_type: 'parse_materials',
      status: 'complete',
      progress_percent: 100,
      input_payload: { source_material_id: material.id },
      completed_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  console.log(`   ✅ Parse job marked complete: ${job?.id?.slice(0, 8)}`)
  return material
}

// ---------------------------------------------------------------------------
// STEP 4: Trigger propose_plan job
// ---------------------------------------------------------------------------

async function triggerProposePlan(course, prof) {
  console.log('\n━━━ STEP 4: Triggering propose_plan job ━━━')

  const { data: job, error } = await supabase
    .from('generation_jobs')
    .insert({
      course_id: course.id,
      created_by: prof.id,
      job_type: 'propose_plan',
      status: 'pending',
      input_payload: { course_id: course.id },
    })
    .select('id')
    .single()

  if (error) {
    console.error('❌ Failed to create propose_plan job:', error.message)
    process.exit(1)
  }

  console.log(`   ✅ Job created: ${job.id}`)

  // Wait for the worker to process it
  const result = await waitForJobCompletion(job.id, 'propose_plan', 180_000)
  if (!result || result.status === 'failed') {
    console.error('❌ propose_plan failed. Check worker logs.')
    // Don't exit — try to get the plan anyway
  }

  // Fetch the plan
  const { data: plan } = await supabase
    .from('generation_plans')
    .select('id, status, plan_data')
    .eq('course_id', course.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!plan) {
    console.error('❌ No plan found after propose_plan.')
    process.exit(1)
  }

  const planData = plan.plan_data
  const moduleCount = planData?.modules?.length ?? 0
  const labCount = planData?.modules?.reduce((s, m) => s + (m.labs?.length ?? 0), 0) ?? 0

  console.log(`   ✅ Plan created (${plan.status}): ${moduleCount} modules, ${labCount} labs`)
  if (planData?.modules) {
    for (const mod of planData.modules) {
      console.log(`      📦 Module: "${mod.title}"`)
      for (const lab of mod.labs ?? []) {
        console.log(`         🧪 Lab: "${lab.title}" (${lab.proposed_concepts?.length ?? 0} concepts)`)
      }
    }
  }

  return plan
}

// ---------------------------------------------------------------------------
// STEP 5: Approve plan → generate labs
// ---------------------------------------------------------------------------

async function approveAndGenerate(plan, course, prof) {
  console.log('\n━━━ STEP 5: Approving plan and generating labs ━━━')

  if (plan.status !== 'draft') {
    console.log(`   ⚠️ Plan status is "${plan.status}", not "draft"`)
  }

  // Approve the plan by replicating the approvePlan logic
  const planData = plan.plan_data

  // Set plan to approved
  const { error: approveErr } = await supabase
    .from('generation_plans')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', plan.id)

  if (approveErr) {
    console.error('❌ Failed to approve plan:', approveErr.message)
    process.exit(1)
  }
  console.log('   ✅ Plan approved')

  // Create modules, labs, concepts, and generate_lab jobs
  let totalJobs = 0
  const jobIds = []

  for (const planModule of planData.modules) {
    const { data: moduleRow, error: modErr } = await supabase
      .from('modules')
      .insert({
        course_id: course.id,
        title: planModule.title,
        position: planModule.position,
      })
      .select('id')
      .single()

    if (modErr) {
      console.error(`❌ Failed to create module: ${modErr.message}`)
      continue
    }

    for (let i = 0; i < planModule.labs.length; i++) {
      const planLab = planModule.labs[i]

      const { data: labInserted, error: labErr } = await supabase
        .from('labs')
        .insert({
          module_id: moduleRow.id,
          course_id: course.id,
          title: planLab.title,
          slug: 'pending',
          position: i,
          generation_status: 'pending',
        })
        .select('id')
        .single()

      if (labErr) {
        console.error(`❌ Failed to create lab: ${labErr.message}`)
        continue
      }

      const labSlug = `${slugify(planLab.title) || 'lab'}-${labInserted.id.slice(0, 6)}`
      await supabase.from('labs').update({ slug: labSlug }).eq('id', labInserted.id)

      // Create concepts
      const conceptIds = []
      for (let ci = 0; ci < (planLab.proposed_concepts ?? []).length; ci++) {
        const { data: concept } = await supabase
          .from('concepts')
          .insert({
            lab_id: labInserted.id,
            name: planLab.proposed_concepts[ci],
            status: 'proposed',
            position: ci,
          })
          .select('id')
          .single()
        if (concept) conceptIds.push(concept.id)
      }

      // Create generate_lab job
      const { data: job, error: jobErr } = await supabase
        .from('generation_jobs')
        .insert({
          course_id: course.id,
          created_by: prof.id,
          job_type: 'generate_lab',
          status: 'pending',
          input_payload: {
            lab_id: labInserted.id,
            source_material_ids: planLab.source_material_ids ?? [],
            concept_ids: conceptIds,
          },
        })
        .select('id')
        .single()

      if (!jobErr && job) {
        jobIds.push({ id: job.id, title: planLab.title })
        totalJobs++
      }
    }
  }

  // Set plan status to generating
  await supabase.from('generation_plans').update({ status: 'generating' }).eq('id', plan.id)

  console.log(`   ✅ Created ${totalJobs} generate_lab jobs`)

  // Wait for all lab generation jobs to complete
  console.log('\n━━━ STEP 6: Waiting for lab generation ━━━')
  for (const j of jobIds) {
    const result = await waitForJobCompletion(j.id, `"${j.title}"`, 300_000)
    if (result?.status === 'failed') {
      console.log(`   ⚠️ Lab "${j.title}" failed: ${result.error_message}`)
    }
  }

  // Mark plan as completed if all done
  await supabase.from('generation_plans').update({ status: 'completed' }).eq('id', plan.id)

  return jobIds
}

// ---------------------------------------------------------------------------
// STEP 7: Verify results
// ---------------------------------------------------------------------------

async function verifyResults(course) {
  console.log('\n━━━ STEP 7: Verifying results ━━━')

  // Check modules
  const { data: modules } = await supabase
    .from('modules')
    .select('id, title, position')
    .eq('course_id', course.id)
    .order('position')

  console.log(`\n   📦 Modules (${modules?.length ?? 0}):`)
  for (const m of modules ?? []) {
    console.log(`      ${m.position + 1}. ${m.title}`)
  }

  // Check labs
  const { data: labs } = await supabase
    .from('labs')
    .select('id, slug, title, generation_status, content_version, module_id')
    .eq('course_id', course.id)
    .order('position')

  console.log(`\n   🧪 Labs (${labs?.length ?? 0}):`)
  for (const lab of labs ?? []) {
    const mod = modules?.find((m) => m.id === lab.module_id)
    const status = lab.generation_status === 'complete' ? '✅' : lab.generation_status === 'failed' ? '❌' : '⏳'
    console.log(`      ${status} ${lab.title}`)
    console.log(`         Module: ${mod?.title ?? 'unknown'} | Slug: ${lab.slug} | Status: ${lab.generation_status}`)
  }

  // Check content blocks total
  const { count: blockCount } = await supabase
    .from('content_blocks')
    .select('id', { count: 'exact', head: true })
    .in('source_material_id', (await supabase
      .from('source_materials')
      .select('id')
      .eq('course_id', course.id)).data?.map(m => m.id) ?? [])

  console.log(`\n   📄 Content blocks: ${blockCount ?? 0}`)

  // Check concepts
  const labIds = (labs ?? []).map((l) => l.id)
  if (labIds.length > 0) {
    const { data: concepts } = await supabase
      .from('concepts')
      .select('id, name, lab_id')
      .in('lab_id', labIds)

    console.log(`   🧠 Concepts: ${concepts?.length ?? 0}`)
  }

  // Check generation jobs summary
  const { data: jobs } = await supabase
    .from('generation_jobs')
    .select('job_type, status')
    .eq('course_id', course.id)

  const jobSummary = {}
  for (const j of jobs ?? []) {
    const key = `${j.job_type}:${j.status}`
    jobSummary[key] = (jobSummary[key] ?? 0) + 1
  }
  console.log(`\n   📊 Job summary:`)
  for (const [key, count] of Object.entries(jobSummary)) {
    console.log(`      ${key}: ${count}`)
  }

  // Final URL
  console.log(`\n   🌐 View course: http://localhost:3000/professor/courses/${course.slug}`)
  console.log(`   🌐 View labs:   http://localhost:3000/professor/courses/${course.slug}/labs`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log(' Muto Pipeline Test: Intro to AI → CNN Architecture Lab')
  console.log('═══════════════════════════════════════════════════════════')

  const prof = await findProfessor()
  const course = await createCourse(prof)
  await uploadMaterial(course, prof)
  const plan = await triggerProposePlan(course, prof)
  await approveAndGenerate(plan, course, prof)
  await verifyResults(course)

  console.log('\n═══════════════════════════════════════════════════════════')
  console.log(' ✅ Pipeline test complete!')
  console.log('═══════════════════════════════════════════════════════════\n')
}

main().catch((err) => {
  console.error('\n💥 Unhandled error:', err)
  process.exit(1)
})
