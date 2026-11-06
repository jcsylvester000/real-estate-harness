// Tools: rulebook topic lookup and document checklists (knowledge served on demand).

import { DOCUMENT_CHECKLISTS, type Party, type TransactionType } from "../knowledge/document-checklists";
import { RULE_TOPICS, RULE_TOPIC_IDS } from "../knowledge/ph-rules";
import type { HarnessTool } from "./tool-types";

export const getRuleTopicTool: HarnessTool<{ topic: string }> = {
  definition: {
    name: "get_rule_topic",
    description: `Read the Philippine real estate rulebook on one topic before answering legal or process questions. Topics: ${RULE_TOPIC_IDS.join(", ")}.`,
    parameters: {
      type: "object",
      properties: { topic: { type: "string", enum: RULE_TOPIC_IDS } },
      required: ["topic"],
    },
  },
  run: ({ topic }) => RULE_TOPICS[topic],
};

export const getDocumentChecklistTool: HarnessTool<{ transactionType: TransactionType; party?: Party }> = {
  definition: {
    name: "get_document_checklist",
    description: "Get the document checklist (with the office for each document) for a Philippine transaction type and party.",
    parameters: {
      type: "object",
      properties: {
        transactionType: { type: "string", enum: Object.keys(DOCUMENT_CHECKLISTS) },
        party: { type: "string", enum: ["buyer", "seller"], description: "Omit for both parties" },
      },
      required: ["transactionType"],
    },
  },
  run: ({ transactionType, party }) => {
    const lists = DOCUMENT_CHECKLISTS[transactionType];
    return party ? { [party]: lists[party] ?? [] } : lists;
  },
};
