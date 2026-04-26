export const InsertCommand = {
    INSERT:       "INSERT",
    APPEND:       "APPEND",
    INSERT_FIRST: "INSERT_FIRST",
    APPEND_LAST:  "APPEND_LAST",
    NEXTLINE:     "NEXTLINE",
    CURRENTLINE:  "CURRENTLINE",
} as const;

export type InsertCommand = (typeof InsertCommand)[keyof typeof InsertCommand];
