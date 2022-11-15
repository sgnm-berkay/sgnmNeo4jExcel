export interface MainHeaderInterface {
  realm: string;
}
export interface HeaderInterface extends MainHeaderInterface {
  language: string;
}
export interface UserInformationInterface extends HeaderInterface {
  username: string;
}

export interface MainHeaderInterfaceWithToken extends MainHeaderInterface {
  authorization: string;
}
