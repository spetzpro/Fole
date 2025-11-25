export interface CurrentUser {
  id: string;
  displayName: string;
  email?: string;
  roles: string[];
}
