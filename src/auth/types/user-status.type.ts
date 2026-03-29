export const USER_STATUSES = ['ACTIVE', 'PENDING', 'SUSPENDED'] as const;

export type UserStatus = (typeof USER_STATUSES)[number];
