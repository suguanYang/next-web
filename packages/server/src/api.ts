import Router from 'koa-router';

import { create } from '@/api/create';
import { getStatus } from '@/api/status';

const router = new Router({
  prefix: '/sandbox/api',
});

router.post('/resource', create);
router.get('/status/:appId', getStatus);

export default router;
