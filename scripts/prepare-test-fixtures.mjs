import { execFileSync } from "node:child_process";
import { prepareSnapshotBuild } from "./build-site.mjs";

// A fresh checkout has no generated group preview manifest. Tests/compile
// may use an empty one; a release build still requires real sync snapshots.
prepareSnapshotBuild({ compileOnly: true });
execFileSync(process.execPath, ["scripts/build-static-css.mjs"], { stdio: "inherit" });
