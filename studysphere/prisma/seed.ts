import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { saveNoteFile } from "../src/lib/storage";
import { buildSimplePdf } from "../src/lib/simple-pdf";
import { readAdminCredentials } from "./admin-env";

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "prisma/seed.ts deletes every existing row before inserting demo data and must never run " +
        "against production. Use `npm run db:create-admin` to bootstrap the first admin instead.",
    );
  }

  // Resolved before any deletion so a missing credential aborts without data loss.
  const adminCredentials = readAdminCredentials();

  await prisma.rating.deleteMany();
  await prisma.bookmark.deleteMany();
  await prisma.report.deleteMany();
  await prisma.noteTag.deleteMany();
  await prisma.note.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.searchEvent.deleteMany();
  await prisma.trustedDomain.deleteMany();
  await prisma.externalResource.deleteMany();
  await prisma.user.deleteMany();

  const admin = await prisma.user.create({
    data: {
      name: adminCredentials.name,
      email: adminCredentials.email,
      passwordHash: await hash(adminCredentials.password, 12),
      role: "ADMIN",
      status: "ACTIVE",
      department: "Computer Science",
      emailVerified: new Date(),
    },
  });

  const student = await prisma.user.create({
    data: {
      name: "Rahul Mehta",
      email: "student@studysphere.dev",
      passwordHash: await hash("Student123", 12),
      role: "STUDENT",
      status: "ACTIVE",
      department: "Computer Science",
      semester: 6,
      emailVerified: new Date(),
    },
  });

  const peer = await prisma.user.create({
    data: {
      name: "Neha Iyer",
      email: "neha@studysphere.dev",
      passwordHash: await hash("Student123", 12),
      role: "STUDENT",
      status: "ACTIVE",
      department: "Computer Science",
      semester: 6,
      emailVerified: new Date(),
    },
  });

  const subjects = await Promise.all(
    [
      ["Operating Systems", "Computer Science", 6],
      ["Database Management Systems", "Computer Science", 5],
      ["Data Structures", "Computer Science", 3],
      ["Computer Networks", "Computer Science", 6],
      ["Theory of Computation", "Computer Science", 5],
    ].map(([name, department, semester]) =>
      prisma.subject.create({
        data: { name: String(name), department: String(department), semester: Number(semester) },
      }),
    ),
  );

  const [os, dbms, dsa, cn] = subjects;

  const notesSeed = [
    {
      title: "Operating Systems Unit 3 Notes",
      description:
        "Deadlock conditions, prevention, avoidance, Banker's algorithm, and resource allocation graphs with worked examples.",
      subject: os,
      unit: "3",
      tags: ["deadlock", "scheduling", "processes", "banker"],
      downloads: 14,
      uploader: student,
      lines: [
        "Four necessary conditions: mutual exclusion, hold and wait,",
        "no preemption, and circular wait.",
        "Prevention removes one condition. Avoidance uses Banker's algorithm.",
      ],
    },
    {
      title: "DBMS Normalization Notes",
      description:
        "1NF through BCNF, functional dependencies, and how to decompose relations without losing information.",
      subject: dbms,
      unit: "4",
      tags: ["normalization", "dbms", "bcnf", "dependencies"],
      downloads: 11,
      uploader: peer,
      lines: [
        "Normalization reduces redundancy using functional dependencies.",
        "2NF removes partial dependency. 3NF removes transitive dependency.",
        "BCNF is a stricter form of 3NF.",
      ],
    },
    {
      title: "Data Structures: Trees and Graphs",
      description:
        "Binary trees, BST operations, BFS, DFS, and shortest-path intuition for semester exams.",
      subject: dsa,
      unit: "5",
      tags: ["trees", "graphs", "bfs", "dfs"],
      downloads: 8,
      uploader: student,
      lines: [
        "BFS explores level by level. DFS goes deep first.",
        "BST search is O(h). Balanced trees keep h close to log n.",
      ],
    },
    {
      title: "Computer Networks Layered Architecture",
      description:
        "OSI vs TCP/IP, reliable transfer, congestion control, and routing notes for unit 2.",
      subject: cn,
      unit: "2",
      tags: ["osi", "tcp", "routing", "congestion"],
      downloads: 6,
      uploader: peer,
      lines: [
        "OSI has seven layers. TCP/IP has four.",
        "TCP provides reliability. IP provides best-effort packet delivery.",
      ],
    },
    {
      title: "Operating System Deadlock Prevention Cheatsheet",
      description:
        "Short cheatsheet covering deadlock prevention strategies and comparison with avoidance.",
      subject: os,
      unit: "3",
      tags: ["deadlock", "prevention", "os"],
      downloads: 4,
      uploader: peer,
      lines: [
        "Prevention is conservative. Avoidance is safer with more information.",
        "Detection and recovery is used when deadlocks are rare.",
      ],
    },
  ];

  for (const item of notesSeed) {
    const note = await prisma.note.create({
      data: {
        title: item.title,
        description: item.description,
        fileUrl: "pending",
        fileType: "pdf",
        fileSize: 0,
        resourceType: "NOTES",
        unit: item.unit,
        uploaderId: item.uploader.id,
        subjectId: item.subject.id,
        downloads: item.downloads,
      },
    });
    const buffer = buildSimplePdf(item.title, item.lines);
    const stored = await saveNoteFile({
      noteId: note.id,
      originalName: "notes.pdf",
      buffer,
      extension: "pdf",
    });
    await prisma.note.update({
      where: { id: note.id },
      data: { fileUrl: stored.relativePath, fileSize: buffer.length },
    });
    for (const name of item.tags) {
      const tag = await prisma.tag.upsert({
        where: { name },
        update: {},
        create: { name },
      });
      await prisma.noteTag.create({ data: { noteId: note.id, tagId: tag.id } });
    }
  }

  const allNotes = await prisma.note.findMany();
  await prisma.rating.create({
    data: { userId: peer.id, noteId: allNotes[0].id, rating: 5, helpful: true },
  });
  await prisma.rating.create({
    data: { userId: student.id, noteId: allNotes[1].id, rating: 4, helpful: true },
  });
  await prisma.rating.create({
    data: { userId: admin.id, noteId: allNotes[0].id, rating: 5, helpful: true },
  });

  await prisma.trustedDomain.createMany({
    data: [
      { domain: "mit.edu", label: "MIT", boost: 1.4 },
      { domain: "stanford.edu", label: "Stanford", boost: 1.4 },
      { domain: "nptel.ac.in", label: "NPTEL", boost: 1.35 },
      { domain: "ocw.mit.edu", label: "MIT OCW", boost: 1.4 },
      { domain: "wikipedia.org", label: "Wikipedia", boost: 1.15 },
      { domain: "openlibrary.org", label: "Open Library", boost: 1.2 },
      { domain: "khanacademy.org", label: "Khan Academy", boost: 1.25 },
    ],
  });

  await prisma.externalResource.createMany({
    data: [
      {
        title: "Deadlock (computer science)",
        url: "https://en.wikipedia.org/wiki/Deadlock_(computer_science)",
        domain: "en.wikipedia.org",
        description: "Encyclopedia article covering deadlock conditions and handling strategies.",
        sourceType: "oer",
      },
      {
        title: "MIT OCW Operating System Engineering",
        url: "https://ocw.mit.edu/courses/6-828-operating-system-engineering-fall-2012/",
        domain: "ocw.mit.edu",
        description: "University course materials for operating systems.",
        sourceType: "university",
      },
      {
        title: "NPTEL Database Management System",
        url: "https://nptel.ac.in/courses/106105175",
        domain: "nptel.ac.in",
        description: "NPTEL lectures and notes on DBMS, including normalization.",
        sourceType: "oer",
      },
      {
        title: "Database normalization",
        url: "https://en.wikipedia.org/wiki/Database_normalization",
        domain: "en.wikipedia.org",
        description: "Overview of normal forms used in relational database design.",
        sourceType: "oer",
      },
    ],
  });

  await prisma.searchEvent.createMany({
    data: [
      { query: "DBMS normalization", resultCount: 8, clicked: true, clickType: "community", userId: student.id },
      { query: "Operating System deadlock", resultCount: 10, clicked: true, clickType: "external", userId: peer.id },
      { query: "computer networks osi", resultCount: 6, clicked: false },
    ],
  });

  console.log("Seeded StudySphere demo data.");
  console.log(`Admin account: ${admin.email} (password taken from ADMIN_PASSWORD, not printed)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
