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

## 2. Assumptions & Tradeoffs

### Assumptions
- **Single-Tenant Operation**: Although an `Organization` concept is modeled in the schema (and every table has `orgId`), the actual deployment assumes a single-tenant environment for now. Multi-tenancy isolation (e.g., via PostgreSQL Row-Level Security) is omitted to keep the implementation straightforward.
- **Interview Scheduling**: Interview scheduling currently depends heavily on Cal.com integrations (implied by `bookingUrl` references). We assume Cal.com owns availability and meeting links. The ATS just records the intention.
- **Local Storage for Attachments**: S3 is configured via `@aws-sdk/client-s3`, but `STORAGE_ROOT` defaults to local disk for development convenience.

### Limitations & Tradeoffs
- **Polling vs. CDC**: The outbox pattern uses a polling mechanism rather than Change Data Capture (CDC, like Debezium). This is a tradeoff favoring operational simplicity over microsecond latency. A 1-second polling tick is fine for a hiring pipeline but avoids the operational complexity of managing replication slots.
- **Resume Parsing**: Used `pdf-parse` for simple text extraction. Real semantic parsing of resumes (experience, education) would require an LLM or specialized third-party service (like Affinda or AWS Textract).
- **Idempotency**: The `IdempotencyInterceptor` is currently scaffolded. Network retries on non-idempotent endpoints (like POST transitions) could lead to double actions if not fully implemented.

### Future Improvements
1. **Webhook Integrations**: Syncing interview status back from Cal.com via webhooks instead of treating the ATS record as static.
2. **Advanced Resume Parsing**: Replace `pdf-parse` with an LLM integration for structured JSON output (skills, years of experience, structured timeline).
3. **Real-time Updates**: Implement WebSocket gateways for the dashboard to reflect real-time candidate pipeline movements without refreshing.
4. **Analytics Aggregation**: Build a materialized view for time-to-hire and pipeline conversion metrics, as running complex aggregations over the event log directly will slow down as data grows.

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
