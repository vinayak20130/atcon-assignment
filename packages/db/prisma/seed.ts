import path from "node:path";
import { config as loadEnv } from "dotenv";
import { PrismaClient, StageType, UserRole } from "@prisma/client";
import { hashPassword } from "@atcon/shared/server";

// The seed runs as a standalone script, so it loads the repo-root .env itself
// rather than relying on the Prisma CLI to have done it. This package is ESM,
// where __dirname does not exist; import.meta.dirname is the equivalent.
loadEnv({
  path: path.resolve(import.meta.dirname, "../../../.env"),
  quiet: true,
});

const prisma = new PrismaClient();

const DEMO_PASSWORD = "Password123!";

async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: "northwind" },
    update: {},
    create: { name: "Northwind Labs", slug: "northwind" },
  });

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const people = [
    {
      email: "alex@northwind.test",
      fullName: "Alex Fernandes",
      role: UserRole.RECRUITER,
    },
    {
      email: "sam@northwind.test",
      fullName: "Sam Oyelaran",
      role: UserRole.RECRUITER,
    },
    {
      email: "jun@northwind.test",
      fullName: "Jun Watanabe",
      role: UserRole.INTERVIEWER,
    },
    {
      email: "nadia@northwind.test",
      fullName: "Nadia Haddad",
      role: UserRole.INTERVIEWER,
    },
  ];

  for (const person of people) {
    await prisma.user.upsert({
      where: { orgId_email: { orgId: org.id, email: person.email } },
      update: {},
      create: { orgId: org.id, passwordHash, ...person },
    });
  }

  // One template to create requisitions from. Its stages are a blueprint —
  // creating a requisition COPIES them, so editing this later never reshapes a
  // pipeline candidates are already sitting in.
  const template = await prisma.pipelineTemplate.upsert({
    where: { orgId_name: { orgId: org.id, name: "Engineering — Standard" } },
    update: {},
    create: {
      orgId: org.id,
      name: "Engineering — Standard",
      description: "Default pipeline for engineering requisitions.",
      isDefault: true,
    },
  });

  const stages = [
    { position: 1, name: "Applied", type: StageType.APPLIED },
    { position: 2, name: "Screen", type: StageType.SCREEN, slaDays: 3 },
    {
      position: 3,
      name: "Technical Interview",
      type: StageType.INTERVIEW,
      requiresScorecard: true,
      slaDays: 5,
    },
    { position: 4, name: "Offer", type: StageType.OFFER, slaDays: 5 },
    { position: 5, name: "Hired", type: StageType.HIRED },
    // Terminal, reachable from any stage rather than sequentially.
    { position: 6, name: "Rejected", type: StageType.REJECTED },
  ];

  for (const stage of stages) {
    await prisma.pipelineTemplateStage.upsert({
      where: {
        templateId_position: { templateId: template.id, position: stage.position },
      },
      update: stage,
      create: { templateId: template.id, ...stage },
    });
  }

  // One scorecard template per organization. Editing it through the API is a
  // deliberate omission — versioning questions that scorecards have already
  // been answered against is a real problem and not one this brief asks about.
  const scorecardTemplate = await prisma.scorecardTemplate.upsert({
    where: { orgId_name: { orgId: org.id, name: "Engineering Interview" } },
    update: {},
    create: {
      orgId: org.id,
      name: "Engineering Interview",
      description:
        "Four dimensions, rated 1-5. Weighted so the two that predict on-the-job performance count double.",
    },
  });

  const criteria = [
    {
      position: 1,
      label: "Technical depth",
      description: "Understands the tools they claim, and where they break.",
      weight: 2,
    },
    {
      position: 2,
      label: "Problem solving",
      description: "Decomposes an unfamiliar problem without being led to the answer.",
      weight: 2,
    },
    {
      position: 3,
      label: "Communication",
      description: "Explains a decision to someone who was not in the room.",
      weight: 1,
    },
    {
      position: 4,
      label: "Collaboration",
      description: "Takes a challenge to their design as information rather than threat.",
      weight: 1,
    },
  ];

  for (const criterion of criteria) {
    await prisma.scorecardCriterion.upsert({
      where: {
        templateId_position: { templateId: scorecardTemplate.id, position: criterion.position },
      },
      update: {},
      create: { templateId: scorecardTemplate.id, maxRating: 5, ...criterion },
    });
  }

  console.log(`\nSeeded ${org.name} with ${people.length} users.`);
  for (const person of people) {
    console.log(`  ${person.email.padEnd(24)} ${person.role.toLowerCase()}`);
  }
  console.log(`  password for all: ${DEMO_PASSWORD}`);
  console.log(`\nPipeline template "${template.name}" (${stages.length} stages):`);
  console.log(`  ${stages.map((s) => s.name).join(" → ")}\n`);
  console.log(`Scorecard template "${scorecardTemplate.name}": ${criteria.map((c) => c.label).join(", ")}\n`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
