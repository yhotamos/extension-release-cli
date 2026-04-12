export type OAuthCredentials = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

export type StoreTarget = {
  publisherId: string;
  extensionId: string;
};

export type StoreConfig = OAuthCredentials & StoreTarget;

// ---- Chrome Web Store API types ----

export type UploadState =
  | 'UPLOAD_STATE_UNSPECIFIED'
  | 'SUCCEEDED'
  | 'IN_PROGRESS'
  | 'FAILED'
  | 'NOT_FOUND';

export type UploadResponse = {
  name: string;
  itemId: string;
  crxVersion: string;
  uploadState: UploadState;
};

export type PublishType = 'PUBLISH_TYPE_UNSPECIFIED' | 'DEFAULT_PUBLISH' | 'STAGED_PUBLISH';

export type PublishParams = {
  publishType?: PublishType;
  deployPercentage?: number;
  skipReview?: boolean;
};

export type ItemState =
  | 'ITEM_STATE_UNSPECIFIED'
  | 'PENDING_REVIEW'
  | 'STAGED'
  | 'PUBLISHED'
  | 'PUBLISHED_TO_TESTERS'
  | 'REJECTED'
  | 'CANCELLED';

export type PublishResponse = {
  name: string;
  itemId: string;
  state: ItemState;
};
