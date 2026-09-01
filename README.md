# Atcon Assignment - Applicant Tracking System

This repository contains the solution for the Full Stack Developer case study: a lightweight recruitment platform focused on job postings, candidate pipeline management, and applicant tracking.

## 1. Technical Overview

### Architecture & System Design
The platform uses a decoupled, full-stack monorepo architecture leveraging `pnpm` workspaces. It is divided into:
- **Backend (`apps/api`)**: A robust REST API built with NestJS.
- **Frontend (`apps/web`)**: A modern React application built with Next.js (App Router).
- **Packages (`packages/db`, `packages/shared`)**: Shared business logic, database schema, and TypeScript types.

#### Key Design Decisions:
1. **Database Strategy (PostgreSQL + Prisma)**: Relational data modeled for strict consistency. Constraints are enforced at the database level where possible (e.g., candidate duplication prevention via unique indexes on normalized emails/phone numbers, sequence validation on application events).
2. **Transactional Outbox Pattern**: To safely handle side effects like sending emails or kicking off asynchronous resume parsing jobs without data loss, the system uses a Transactional Outbox. State changes and event dispatch intents are written in a single database transaction. A separate relay worker polls the `OutboxEvent` table and routes events to Redis queues.
3. **Event Sourcing for Audit Trails**: The `ApplicationEvent` table acts as the source of truth for an application's history (status changes, rejections, scheduling). The `currentStageId` is a denormalized read model. This ensures a fully reproducible and auditable timeline.
4. **Role-Based Access Control (RBAC) & Scoping**: Implemented custom guards to ensure `RECRUITER` and `INTERVIEWER` roles exist. A Job Assignment model scopes access, ensuring recruiters can only view or manage applications for pipelines they are explicitly assigned to.
5. **Candidates as passwordless actors**: Candidates deliberately do not have user accounts. They access their applications via signed links, preventing credential leaks and removing password management complexity.

### Frameworks & Tools
- **API**: NestJS, Zod (validation), BullMQ (background jobs), Passport/JWT (auth).
- **Web**: Next.js 15, React 19, TypeScript.
- **Database**: PostgreSQL (main store), Prisma (ORM/migrations).
- **Cache/Queues**: Redis + BullMQ.
- **Infrastructure**: Docker Compose (for local PostgreSQL, Redis, and Mailpit).

### Scalability Considerations
- **Stateless API**: The API servers are fully stateless (JWTs for auth, Redis for queues), making it trivial to scale out horizontally.
- **Outbox Relay**: Designed safely with `FOR UPDATE SKIP LOCKED`. Multiple worker instances can run concurrently without race conditions, taking outbox leases and increasing processing throughput safely.
- **Queueing Heavy Tasks**: File uploads (S3/local storage) and PDF parsing (`pdf-parse`) are offloaded to background workers via BullMQ, keeping HTTP requests fast and non-blocking.
- **Denormalization for Reads**: While the audit trail is event-sourced, heavy queries (like fetching active applications) hit denormalized views (e.g., `Application.currentStageId` and `Candidate.skills` array) to avoid expensive joins.

## 2. Assumptions Made

Here are the main assumptions I made after reading the expected capabilities. The goal was to keep the implementation practical for the assignment while still designing it in a way that could grow into a production system.

In a production environment I would probably use ReBAC for access control, because recruiter access usually depends on the team, role, hiring panel, geography, and ownership of a requisition. For this case study I kept it simpler: static roles such as `RECRUITER` and `INTERVIEWER`, plus requisition-level assignment checks.

For resume parsing and notifications, a production system would usually depend on an external API vendor, a document processing service, or a separate consumer group. For this assignment I used background workers and queues. The API accepts the request, stores the important state, and lets workers handle resume parsing and notification delivery asynchronously.

For duplicate candidate detection, I used deterministic identity keys based on normalized email and phone number. This is simple, explainable, and safe. A stronger production system could also compare resume-derived signals such as past company names, education, LinkedIn URL, and work history. I did not auto-reject candidates based on fuzzy matching because that can easily reject a real candidate incorrectly. Instead, deterministic matches are handled automatically and fuzzy matches would be better surfaced as a recruiter review queue.

### Requirement: Publish Job Openings and Receive Applications

**Questions that came up**

- Which role is allowed to create and publish job openings?
- Should all recruiters see all applications, or only applications for jobs they own?
- How should spam or bot submissions be handled?

**Assumptions made**

- Recruiters can create and manage job requisitions.
- A recruiter only sees jobs and applications for requisitions they are assigned to.
- Public job pages are read-only and expose only candidate-safe fields.
- The application form includes a honeypot field for basic bot protection.
- More advanced spam handling such as rate limits, captcha, IP reputation, and abuse scoring would be added later.

### Requirement: Parse and Store Candidate Profiles and Resumes

**Questions that came up**

- Should resume parsing happen during the form submission or in the background?
- What happens if parsing fails?
- Where should uploaded files be stored?

**Assumptions made**

- Resume upload should not block application submission for too long.
- The API stores the application and document first, then queues resume parsing.
- If parsing fails, the candidate application still exists and the document is marked with a failed/partial parse state.
- Local file storage is enough for development. In production this would move to S3 or another object store.
- The parser extracts useful profile fields such as name, email, skills, LinkedIn URL, and experience signals where possible.

### Requirement: Move Candidates Through Configurable Hiring Stages

**Questions that came up**

- Who can configure hiring stages?
- Can stages be edited after candidates are already inside the pipeline?
- Which role can move candidates through stages?
- Should backward moves and rejections require a reason?

**Assumptions made**

- Recruiters can create requisitions from a pipeline template.
- Stages are copied onto the requisition when it is created. This means editing a template later does not unexpectedly change an active hiring pipeline.
- Recruiters can move candidates through stages.
- Interviewers can submit scorecards, but they cannot move candidates.
- Rejections, reopenings, and backward moves require a reason so the audit trail is meaningful.
- Candidate movement is handled by a state machine so rules are explicit and testable.

### Requirement: Schedule Interviews and Record Structured Scorecards

**Questions that came up**

- Who can schedule interviews?
- Should candidates choose their own slots through Cal.com?
- Do backup interviewers need to exist?
- Does every interview stage require a scorecard?

**Assumptions made**

- Recruiters schedule interviews.
- Cal.com can own availability, booking, and meeting links. The ATS stores the interview record and links it to the candidate, job, and stage.
- Each interview has panelists, and some panelists can be marked as required.
- Backup or optional interviewers can be added without blocking the candidate from moving forward.
- Required scorecards can gate final hiring decisions, while the offer stage can still be used by recruiters to shortlist a candidate after interview.

### Requirement: Track Time-to-Hire and Pipeline Health

**Questions that came up**

- Does time-to-hire start when the job is opened or when the candidate applies?
- What does pipeline health mean in a small ATS?
- Should pipeline health be one score or a set of explainable metrics?

**Assumptions made**

- Time-to-fill starts when a requisition opens and ends when the role is filled.
- Time-to-hire starts when a candidate applies and ends when they are hired.
- Pipeline health should be explainable, not a single black-box score.
- The dashboard tracks stage reach, conversion to the next stage, median time in stage, active/hired/rejected counts, and simple alerts for slow or low-conversion stages.
- For larger scale, I would move these analytics to materialized views or scheduled aggregates instead of calculating everything directly from events on every request.

### Limitations and Improvements

- Idempotency is scaffolded but not fully implemented. I would either remove the placeholder or add a real `Idempotency-Key` store for create-style endpoints.
- Resume parsing is lightweight and deterministic. A production version could use an LLM or a resume parsing vendor for structured work history and education extraction.
- Interview scheduling is recorded in the ATS, but calendar availability is assumed to live in Cal.com.
- The UI is intentionally lightweight. With more time I would add richer interview forms, scorecard screens, job-scoped analytics filters, and real-time board updates.

## 3. Demonstration

### Source Code
The codebase is structured as a pnpm monorepo.
- `apps/api`: The backend.
- `apps/web`: The frontend.
- `packages/db`: Database schema and migrations.
- `packages/shared`: Shared types and logic.

### Setup Instructions

**Prerequisites:**
- Node.js `v24.14.0` (as defined in `.nvmrc`)
- pnpm `v11.x`
- Docker & Docker Compose

**1. Start Infrastructure**
```bash
# Starts Postgres, Redis, and Mailpit (for local email testing)
cd infra
docker compose up -d
cd ..
```

**2. Install Dependencies**
```bash
pnpm install
```

**3. Environment Setup**
```bash
cp .env.example .env
# Edit .env if necessary, default ports match docker-compose
```

**4. Database Setup**
```bash
pnpm --filter @atcon/db generate
pnpm --filter @atcon/db migrate
pnpm --filter @atcon/db seed # Optional, to populate test data
```

**5. Start the Services**
```bash
# In one terminal window, start the NestJS API & Worker
pnpm --filter @atcon/api dev

# In another terminal window, start the Next.js Frontend
pnpm --filter @atcon/web dev
```
- Web App: http://localhost:3000
- API Swagger Docs (if enabled): http://localhost:4000/api
- Local Email (Mailpit): http://localhost:8025

### Walkthrough
*(Provide a short video link or explain the flow here)*
- Open the web application and log in as a recruiter.
- Navigate to Jobs to see the existing requisitions.
- Submit a test application via the Careers portal (`http://localhost:3000/careers`).
- The application will appear in the recruiter dashboard. Move the candidate through the stages and view the corresponding audit logs and background jobs (like resume parsing and email notifications) triggering.
