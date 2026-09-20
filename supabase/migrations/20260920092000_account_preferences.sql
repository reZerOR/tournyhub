alter table "user"
  add column "appearance" text not null default 'light',
  add column "soundEnabled" boolean not null default false,
  add constraint "user_appearance_check"
    check ("appearance" in ('light', 'dark'));
