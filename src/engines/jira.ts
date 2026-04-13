// src/engines/jira.ts

import axios, { AxiosInstance } from "axios";

import { escapeQuotes, getUnixTime } from "../util";

let client: AxiosInstance | undefined;
let origin: string | undefined;

// https://confluence.atlassian.com/jiracoreserver073/search-syntax-for-text-fields-861257223.html#Searchsyntaxfortextfields-escapingSpecialcharacters
const sanitize = (s: string) =>
  escapeQuotes(s.replace(/[+&|!(){}[\]^~*?\\:]/g, ""))
    .replace(/\s+/g, " ")
    .trim();

const engine: Engine = {
  id: "jira",
  init: (options: { origin: string; token: string; user: string }) => {
    client = axios.create({
      auth: { password: options.token, username: options.user },
      baseURL: `${options.origin}/rest/api/3`,
    });
    origin = options.origin;
  },
  isSnippetLarge: true,
  name: "Jira",
  search: async (q: string, includeComments: boolean = false) => {
    if (!(client && origin)) {
      throw Error("Engine not initialized");
    }

    const sanitizedQ = sanitize(q);
    if (!sanitizedQ) {
      return [];
    }

    // TODO: Use API v3?
    // https://developer.atlassian.com/server/jira/platform/jira-rest-api-examples/#searching-for-issues-examples
    const jql = includeComments
      ? `(comment ~ "${sanitizedQ}" OR text ~ "${sanitizedQ}")`
      : `text ~ "${sanitizedQ}"`;

    const data: {
      issues: {
        fields: {
          summary: string;
          /** e.g. "2017-11-20T11:50:25.653-0500" */
          updated: string;
          comment?: { comments: { body: string }[] };
        };
        key: string;
        renderedFields: {
          description: string;
          comment?: {
            comments: { author: { displayName: string }; body: string }[];
          };
        };
      }[];
    } = (
      await client.get('/search/jql', {
        params: {
          expand: 'renderedFields',
          fields: includeComments
            ? 'summary,updated,description,comment'
            : 'summary,updated,description',
          jql,
          maxResults: 100,
        },
      })
    ).data;

    return data.issues.map(issue => ({
      modified: getUnixTime(issue.fields.updated),
      snippet: issue.renderedFields.description,
      comments: includeComments ? issue.renderedFields.comment?.comments.map(c => ({
        author: c.author.displayName,
        body: c.body
      })) : undefined,
      title: `${issue.key}: ${issue.fields.summary}`,
      url: `${origin}/browse/${issue.key}`,
    }));
  },
};

export default engine;
