import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { generateWish } from "@/inngest/functions/generateWish";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateWish],
});
