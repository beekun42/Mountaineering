import type { MetadataRoute } from "next";

/** 個人利用向け：検索エンジンに載せない（URL 秘匿は別途ユーザーの運用に依存） */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
