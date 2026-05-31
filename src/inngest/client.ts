import { Inngest, EventSchemas } from "inngest";

type Events = {
  "occasion/upcoming": {
    data: {
      draftId: string;
    };
  };
  "approval/responded": {
    data: {
      draftId: string;
      decision: "approved" | "changes";
      feedback?: string;
      channel: "whatsapp" | "web";
    };
  };
};

export const inngest = new Inngest({
  id: "parekh-family",
  schemas: new EventSchemas().fromRecord<Events>(),
});
