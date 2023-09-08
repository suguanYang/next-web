import { RouterContext } from 'koa-router';

import { TerminalLowerCaseEnum } from '@/common/app';
import { getAppStatus } from '@/source-management/lifecycle';

type PreviewRequestParams = { appId: string; platform: TerminalLowerCaseEnum };
export const getStatus = async (ctx: RouterContext) => {
  const { appId } = ctx.params as PreviewRequestParams;
  if (!appId) {
    ctx.response.status = 400;
    return;
  }

  const [status, message] = await getAppStatus(appId as string);

  ctx.response.body = {
    message: '',
    code: '',
    content: {
      status,
      message,
    },
  };
  return;
};
