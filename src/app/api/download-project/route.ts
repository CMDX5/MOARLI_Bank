import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { createReadStream } from "fs";
import { readdirSync, statSync, mkdirSync, copyFileSync, writeFileSync } from "fs";
import { join } from "path";
import { requireAuth } from "@/lib/auth-verify";
import { doc, getDoc } from "firebase/firestore";
import { firebaseDb } from "@/lib/firebase";

export async function GET(req: NextRequest) {
  // TODO: Remove or properly secure before production launch
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Route disabled in production" }, { status: 403 });
  }

  // Auth check
  const auth = await requireAuth(req);
  if (auth.error) return auth.error;
  if (!auth.uid) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  // Verify admin role
  if (auth.uid) {
    const adminDoc = await getDoc(doc(firebaseDb, "moraliUsers", auth.uid));
    if (!adminDoc.exists() || adminDoc.data()?.role !== "admin") {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }
  }

  try {
    const projectRoot = "/home/z/my-project";
    const tmpDir = "/tmp/morali-bank-export";
    
    // Clean up any previous export
    execSync("rm -rf " + tmpDir);
    mkdirSync(tmpDir, { recursive: true });
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    mkdirSync(join(tmpDir, "prisma"), { recursive: true });
    mkdirSync(join(tmpDir, "public"), { recursive: true });
    mkdirSync(join(tmpDir, "scripts"), { recursive: true });
    mkdirSync(join(tmpDir, "src/app"), { recursive: true });
    mkdirSync(join(tmpDir, "src/lib"), { recursive: true });
    mkdirSync(join(tmpDir, "src/components/ui"), { recursive: true });
    mkdirSync(join(tmpDir, "src/hooks"), { recursive: true });
    mkdirSync(join(tmpDir, "src/services"), { recursive: true });
    mkdirSync(join(tmpDir, "src/utils"), { recursive: true });

    // Files to copy (relative paths)
    const filesToCopy = [
      // Root config
      "package.json",
      "next.config.ts",
      "tsconfig.json",
      "postcss.config.mjs",
      "tailwind.config.ts",
      "eslint.config.mjs",
      "components.json",
      "bun.lock",
      ".gitignore",
      ".env.production.example",
      "DEPLOY.md",
      "firebase.json",
      "firestore.rules",
      
      // Prisma
      "prisma/schema.prisma",
      "prisma/schema.postgresql.prisma",
      
      // Public
      "public/logo.svg",
      "public/robots.txt",
      
      // Source
      "src/app/layout.tsx",
      "src/app/globals.css",
      "src/app/page.tsx",
      "src/app/api/route.ts",
      
      // Lib
      "src/lib/db.ts",
      "src/lib/firebase.ts",
      "src/lib/auth-verify.ts",
      "src/lib/rate-limit.ts",
      "src/lib/pin-utils.ts",
      "src/lib/utils.ts",
      "src/lib/admin-logger.ts",
    ];

    // Copy individual files
    for (const file of filesToCopy) {
      const src = join(projectRoot, file);
      const dst = join(tmpDir, file);
      try {
        if (statSync(src).isFile()) {
          mkdirSync(join(dst, ".."), { recursive: true });
          copyFileSync(src, dst);
        }
      } catch {}
    }

    // Copy all API route files
    function copyDirRecursive(srcDir: string, dstDir: string) {
      try {
        const entries = readdirSync(srcDir, { withFileTypes: true });
        for (const entry of entries) {
          const srcPath = join(srcDir, entry.name);
          const dstPath = join(dstDir, entry.name);
          if (entry.isDirectory()) {
            mkdirSync(dstPath, { recursive: true });
            copyDirRecursive(srcPath, dstPath);
          } else {
            copyFileSync(srcPath, dstPath);
          }
        }
      } catch {}
    }

    copyDirRecursive(join(projectRoot, "src/app/api"), join(tmpDir, "src/app/api"));
    copyDirRecursive(join(projectRoot, "src/components/ui"), join(tmpDir, "src/components/ui"));
    copyDirRecursive(join(projectRoot, "src/hooks"), join(tmpDir, "src/hooks"));
    copyDirRecursive(join(projectRoot, "src/services"), join(tmpDir, "src/services"));
    copyDirRecursive(join(projectRoot, "src/utils"), join(tmpDir, "src/utils"));
    copyDirRecursive(join(projectRoot, "scripts"), join(tmpDir, "scripts"));

    // Create .env file template (no real secrets)
    writeFileSync(join(tmpDir, ".env"), "# Set your DATABASE_URL here\n");

    // Create tar.gz
    const archivePath = "/tmp/morali-bank.tar.gz";
    execSync("cd " + tmpDir + " && tar czf " + archivePath + " .");

    // Read the archive
    const archiveBuffer = execSync("cat " + archivePath);
    
    // Clean up
    execSync("rm -rf " + tmpDir + " " + archivePath);

    return new NextResponse(archiveBuffer, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": "attachment; filename=\"morali-bank.tar.gz\"",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
