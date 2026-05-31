import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { generateAndApprove } from "@/inngest/functions/generateAndApprove";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateAndApprove],
});
