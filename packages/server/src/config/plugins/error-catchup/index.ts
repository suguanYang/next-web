import { Plugin, ErrorPayload } from 'vite';

import { cleanUrl } from '@/utils';
import { setError } from '@/source-management/error';

export default function (root: string): Plugin {
  return {
    name: 'error-catchup',
    configureServer(server) {
      server.ws.send = (msg: any) => {
        if (msg?.type === 'error') {
          const err: ErrorPayload['err'] = msg.err;
          if (err.id) {
            // trim
            err.plugin = '';
            err.stack = '';
            err.pluginCode = '';
            err.loc = undefined;
            err.message = err.message.replace(/(\r\n|\n|\r)/gm, '\\n').replace(/"/g, "'");
            err.frame = err.frame?.replace(/(\r\n|\n|\r)/gm, '\\n').replace(/"/g, "'");
            setError(cleanUrl(err.id), err);
          }
        }
      };
    },
  };
}
