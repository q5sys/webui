import { T } from "app/translate-marker";

export * from "./afp/afp";
export * from "./iscsi/iscsi";
export * from "./nfs/nfs";
export * from "./smb/smb";
export * from "./webdav/webdav";

export const delete_share_message = T("The sharing configuration will be removed.\
 Data in the share dataset will not be affected.");
