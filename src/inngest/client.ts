import { Inngest, EventSchemas } from "inngest";

type Events = {
  "occasion/upcoming": {
    data: {
      // The function (not the cron) creates the draft idempotently from this
      // identity, so a failed send can never orphan a half-created draft.
      specialDayId: string;
      occasionDate: string;
      ownerUserId: string;
      friendId: string;
      scheduledFor: string; // ISO instant
      kind: "text" | "photo" | "video";
    };
  };
};

export const inngest = new Inngest({
  id: "parekh-family",
  schemas: new EventSchemas().fromRecord<Events>(),
});
