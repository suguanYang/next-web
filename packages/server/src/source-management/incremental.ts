import { logger } from "@/utils/logger";
import { PreviewInfo } from "@/common/app";
import { getClient } from "@/service/redis";
import { millisecondsUntilEndOfToday } from "@/utils";
import { redisVersionKey } from "@/source-management/remote-source";

const APP_INFOS_KEY = (appId: string) => `incremental:${appId}`;
export const checkLatestIncrementalInfo = async (appId: string) => {
  const client = getClient();

  const latestAppInfoStr = await client.get(APP_INFOS_KEY(appId));
  const appResourceVersion = await client.get(redisVersionKey(appId));

  return !!latestAppInfoStr && !!appResourceVersion;
};

type IncrementalAppInfo = {
  parsedPageList?: any[];
  routes?: any[];
  layoutList?: any[];
};
export const mergeAppInfo = async (
  appInfo: PreviewInfo,
  data: IncrementalAppInfo,
  incremental: boolean
) => {
  const client = getClient();
  const { appId } = appInfo;
  try {
    const incrementalAppInfo = {
      //   microFlows: appInfo.microFlows,
      parsedPageList: data.parsedPageList,
      routes: data.routes,
      layoutList: data.layoutList,
    };
    if (!incremental) {
      await client.set(
        APP_INFOS_KEY(appId),
        JSON.stringify(incrementalAppInfo),
        "PX",
        millisecondsUntilEndOfToday()
      );
      return data;
    }

    const latestAppInfoStr = await client.get(APP_INFOS_KEY(appId));
    const latestAppInfo: IncrementalAppInfo = JSON.parse(
      latestAppInfoStr || "{}"
    );
    const newParsedPageList = [
      ...(latestAppInfo.parsedPageList?.filter(
        (lm) => !data.parsedPageList?.some((m) => lm.id === m.id)
      ) || []),
      ...(data.parsedPageList || []),
    ];
    const newRoutes = [
      ...(latestAppInfo.routes?.filter(
        (lm) => !data.routes?.some((m) => lm.path === m.path)
      ) || []),
      ...(data.routes || []),
    ];
    const newLayoutList = [
      ...(latestAppInfo.layoutList?.filter(
        (lm) => !data.layoutList?.some((m) => lm.id === m.id)
      ) || []),
      ...(data.layoutList || []),
    ];
    return {
      ...data,
      //   microFlows: newMicroFlows,
      incrementalParsedPageList: newParsedPageList,
      routes: newRoutes,
      layoutList: newLayoutList,
    };
  } catch (error) {
    logger.error(
      `preview: failed to merge app info ${appId}, ${error?.toString()}`
    );
  }

  return appInfo;
};
