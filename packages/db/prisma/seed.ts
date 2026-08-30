import path from "node:path";
import { config as loadEnv } from "dotenv";
import { PrismaClient, UserRole } from "@prisma/client";
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

  console.log(`\nSeeded ${org.name} with ${people.length} users.`);
  for (const person of people) {
    console.log(`  ${person.email.padEnd(24)} ${person.role.toLowerCase()}`);
  }
  console.log(`  password for all: ${DEMO_PASSWORD}\n`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
