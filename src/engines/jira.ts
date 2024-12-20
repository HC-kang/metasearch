// src/engines/jira.ts

import axios, { AxiosInstance } from "axios";

import { escapeQuotes, getUnixTime } from "../util";

let client: AxiosInstance | undefined;
let origin: string | undefined;

// https://confluence.atlassian.com/jiracoreserver073/search-syntax-for-text-fields-861257223.html#Searchsyntaxfortextfields-escapingSpecialcharacters
const sanitize = (s: string) =>
  escapeQuotes(s.replace(/[+&|!(){}[\]^~*?\\:]/g, ""))
    .replace(/\s+/, " ")
    .trim();

const engine: Engine = {
  id: "jira",
  init: (options: { origin: string; token: string; user: string }) => {
    client = axios.create({
      auth: { password: options.token, username: options.user },
      baseURL: `${options.origin}/rest/api/2`,
    });
    origin = options.origin;
  },
  isSnippetLarge: true,
  name: "Jira",
  search: async (q: string, includeComments: boolean = false) => {
    if (!(client && origin)) {
      throw Error("Engine not initialized");
    }

    // TODO: Use API v3?
    // https://developer.atlassian.com/server/jira/platform/jira-rest-api-examples/#searching-for-issues-examples
    const jql = includeComments
      ? `(comment ~ "${sanitize(q)}" OR text ~ "${sanitize(q)}")`
      : `text ~ "${sanitize(q)}"`;

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
      await client.get('/search', {
        params: {
          expand: 'renderedFields',
          fields: 'summary,updated,description,comment',
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
