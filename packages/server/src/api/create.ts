import { RouterContext } from 'koa-router';

import { timer } from '@/utils';
import {
  APP_STATUS,
} from '@/source-management/lifecycle';

export const create = async (ctx: RouterContext) => {
  try {
    ctx.response.status = 200;
  } catch (error) {
    ctx.status = 500;
    ctx.response.body = {
      message: '',
      code: '',
      content: {
        status: APP_STATUS.FAILED,
        message: String(error),
      },
    };
  }
};
