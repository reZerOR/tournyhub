import type { LivePlayerSummary } from "@/domain/live";
import type { Queryable } from "@/server/database/queryable";

/** Internal read model. Call only after live Auction membership is authorized. */
export async function loadLivePlayers(
  db: Queryable,
  auctionId: string,
): Promise<LivePlayerSummary[]> {
  const result = await db.query<LivePlayerSummary>(
    `select pe."id", pe."display_name" as "displayName", pe."tier_id" as "tierId",
            case
              when pe."is_representative" and pe."team_id" is not null then 'preassigned'
              when s."id" is not null then case when s."source" = 'forced' then 'forced' else 'sold' end
              when exists (select 1 from "player_presentation" pp
                            where pp."player_entry_id" = pe."id" and pp."state" in ('open', 'closing')) then 'active'
              when um."resolution" = 'final_unsold' then 'final_unsold'
              when um."player_entry_id" is not null and um."resolved_at" is null then 'unsold'
              else 'waiting'
            end as "status",
            case when pe."is_representative" then pe."team_id" else s."team_id" end as "teamId",
            s."amount"
       from "player_entry" pe
       left join "tier" t on t."id" = pe."tier_id"
       left join "sale" s on s."player_entry_id" = pe."id" and s."reversed_at" is null
       left join "unsold_membership" um on um."player_entry_id" = pe."id"
      where pe."auction_id" = $1
      order by t."position" asc nulls last, pe."display_name" asc, pe."id" asc`,
    [auctionId],
  );
  return result.rows;
}
