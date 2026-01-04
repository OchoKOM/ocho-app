import { User as LuciaUser } from "lucia";

declare module "lucia" {
  interface User extends LuciaUser {
    lastUsernameChange?: Date | null;
  }
}
