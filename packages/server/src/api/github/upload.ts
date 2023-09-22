import { promisify } from "node:util";
import { exec } from "node:child_process";

import { RouterContext } from "koa-router";
import fse from "fs-extra";
import path from "node:path";
import { getLock } from "@/infra/lock";
import { writeToRemote } from "@/source-management/remote-source";

type UploadBody = {
  appId: string;
  branch?: string;
  userName: string;
  repoName: string;
};

const clone = async (
  {
    repoName,
    userName,
    branch,
  }: { repoName: string; userName: string; branch: string },
  cloneDst: string
) => {
  const cloneCmd = `git clone --depth 1 --branch ${branch} https://github.com/${userName}/${repoName}.git ${cloneDst}`;

  await promisify(exec)(cloneCmd);

  return () => fse.rmdir(cloneDst, { recursive: true });
};

const validate = (body: UploadBody) => {
  const { appId, userName, repoName } = body;
  if (!appId) {
    throw new Error("appId is required");
  }
  if (!userName) {
    throw new Error("userName is required");
  }
  if (!repoName) {
    throw new Error("repoName is required");
  }
};

const upload = async (ctx: RouterContext) => {
  const acquire = getLock();
  let releaseLock: () => Promise<void> = () => Promise.resolve();
  try {
    const { appId, repoName, branch, userName } = ctx.request
      .body as UploadBody;

    validate({ appId, branch, userName, repoName });

    releaseLock = await acquire(`upload-${appId}`);
    const tmpDir = path.join(process.cwd(), "./tmp");
    const cleanUp = await clone(
      {
        repoName,
        userName,
        branch: branch || "master",
      },
      tmpDir
    );

    await writeToRemote({
      appId,
      rootDir: tmpDir,
    });
    await cleanUp();

    ctx.response.status = 200;
  } catch (error) {
    ctx.status = 500;
    ctx.response.body = {
      message: String(error),
    };
  } finally {
    releaseLock();
  }
};

export default upload;
