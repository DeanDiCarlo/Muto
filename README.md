# Muto

**The bridge between what professors teach and what students actually understand.**

---

## The Problem

Every semester, professors walk into classrooms with a blind spot. They've built a syllabus, assigned readings, and prepared lectures — but they have no real-time signal on where students are falling behind until it's too late. Midterm exams reveal gaps that formed weeks ago. Office hours serve the students who show up, not the ones who need it most. And the students struggling with foundational concepts at 11pm on a Sunday have nowhere to turn.

The feedback loop between teaching and learning is broken. Professors are forced to guess. Students are forced to wait.

## The Thesis

Muto transforms a professor's existing course materials — syllabi, textbook chapters, scholarly resources — into interactive labs that students engage with on their own time. Each lab includes a **Knowledge Review**: a structured, concept-tagged set of questions modeled after the reading comprehension checks found at the end of textbook chapters. Not graded. Not punitive. Designed to surface exactly where understanding holds and where it breaks down.

Every student interaction with a Knowledge Review feeds into a **concept-level knowledge graph** — a living map of what the class understands and what it doesn't, down to individual concepts within each topic. Professors set **insight deadlines** tied to their class schedule, receiving humanized reports before each session so that in-class time directly addresses the gaps students are actually experiencing.

Students also have access to a **freeform chatbot** scoped to each lab's content — always-available help that functions like office hours without the time constraints. The chatbot is for learning. The Knowledge Review is for measurement. Separating these two modes produces cleaner signal and better student experiences in both.

Labs never close. The knowledge graph evolves across the full semester as students study, restudy, and deepen their understanding over time.

**Muto doesn't replace professors. It makes them more effective by showing them exactly where to focus.**

## How It Works

### For Professors

1. **Upload course materials** — syllabi, textbook chapters, lecture notes, scholarly papers. Upload directly or connect through your institution's LMS.
2. **Generate interactive labs** — Muto's generation pipeline reads your materials and produces a structured lab for each topic, complete with a concept taxonomy and Knowledge Review questions.
3. **Set your schedule** — Define insight deadlines tied to your class meeting days. Muto compiles concept-level reports and delivers them before each session.
4. **Teach with clarity** — Walk into class knowing exactly which concepts need reinforcement, which students are struggling, and where the class is strong.

### For Students

1. **Work through labs** — Engage with interactive content built from your actual course materials, not generic study guides.
2. **Complete Knowledge Reviews** — Answer concept-targeted questions at the end of each lab. These aren't graded — they're diagnostic checkpoints that help you and your professor understand where you stand.
3. **Ask the chatbot anything** — Each lab has an always-available Q&A assistant scoped to that topic. Think of it as office hours that never close.
4. **Restudy anytime** — Labs stay open all semester. Come back before finals and the Knowledge Review will show you (and your professor) how your understanding has evolved.

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│                  PROFESSOR INPUTS                    │
│  Syllabus  ·  Textbooks  ·  Papers  ·  Schedule     │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│              GENERATION PIPELINE (Render)            │
│                                                      │
│  Course materials → Concept taxonomy                 │
│                   → Lab content                      │
│                   → Knowledge Review questions        │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│                 INTERACTIVE LABS                      │
│         One per topic · Never closes                 │
├────────────────────┬────────────────────────────────┤
│                    │                                 │
│  ┌─────────────────▼──────────┐  ┌────────────────┐ │
│  │    KNOWLEDGE REVIEW        │  │   CHATBOT Q&A  │ │
│  │    Structured questions    │  │   Freeform     │ │
│  │    Concept-tagged          │  │   Exploratory  │ │
│  │    Diagnostic, not graded  │  │   Always open  │ │
│  │                            │  │                │ │
│  │    PURPOSE: Measurement    │  │  PURPOSE:      │ │
│  │                            │  │  Learning      │ │
│  └─────────────┬──────────────┘  └────────────────┘ │
│                │                                     │
└────────────────┼─────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────┐
│            CONCEPT KNOWLEDGE GRAPH                   │
│                                                      │
│  Per-student, per-concept mastery tracking            │
│  Aggregated class-level patterns                     │
│  Evolves across the full semester                    │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│           PROFESSOR INSIGHT REPORTS                  │
│                                                      │
│  Triggered by insight deadlines                      │
│  Humanized, actionable metrics                       │
│  Always accessible on-demand                         │
└─────────────────────────────────────────────────────┘
```

## Core Entities

| Entity | Description |
|---|---|
| **Course** | A professor's course for a given semester. Contains modules and schedule configuration. |
| **Module** | A topic unit within a course (e.g., "Quantum Entanglement"). Maps to one or more labs. |
| **Lab** | An interactive learning unit generated from course materials. Contains content, a concept taxonomy, and Knowledge Review questions. Never expires. |
| **Concept** | A node in the knowledge graph representing a discrete idea within a module (e.g., "Bell states," "measurement collapse"). Generated as part of the lab's concept taxonomy. |
| **Knowledge Review** | A structured set of concept-tagged questions attached to a lab. Student responses are the primary signal for the knowledge graph. |
| **Interaction** | A student's engagement with a lab — Knowledge Review answers (primary signal) and chatbot conversations (secondary signal). |
| **Insight Deadline** | A professor-defined timestamp (typically aligned to class meeting days) that triggers a compiled metrics report. |
| **Insight Report** | A humanized summary of the knowledge graph state at a point in time, highlighting weak concepts, trends, and recommended focus areas. |

## The Vision

Muto starts with quantum computing courses at Miami University. The generation pipeline is designed to be subject-agnostic from day one.

The long-term vision is simple: **every professor, in every discipline, should know exactly what their students understand before they walk into a classroom.** The tools to teach well shouldn't require guesswork. The help students need shouldn't require waiting. And the feedback loop between teaching and learning should be measured in hours, not weeks.

This isn't about replacing the classroom. It's about making every minute in the classroom count.

## Tech Stack

- **Frontend**: React + TypeScript
- **Backend**: Node.js + TypeScript
- **Database**: Supabase (PostgreSQL + Row Level Security)
- **Generation Pipeline**: Render (structured LLM pipeline)
- **LMS Integration**: Canvas API (Phase 2)
- **Auth**: Supabase Auth (institution-scoped)

## Project Status

🚧 **Active Development** — Building the core generation pipeline and student interaction loop.

## Team

- **Deano** — Co-founder, Engineering
- **Owen Gulka** — Co-founder
- **Dr. Liran Ma** — Advisor, Miami University

---

*Muto — [trymuto.com](https://trymuto.com)*