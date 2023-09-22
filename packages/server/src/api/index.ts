import Router from "koa-router";

import upload from "./github/upload";

const router = new Router({
  prefix: "/sandbox/api",
});

const GITHUB_UPLOAD = "/github/upload";

router.post(GITHUB_UPLOAD, upload);

export default router;
