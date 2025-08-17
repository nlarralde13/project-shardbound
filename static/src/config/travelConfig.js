// MVP1.1 travel / encounter tuning knobs (no logic here)
export const TravelConfig = {
  // Probability
  P_BASE: 0.15,
  P_FLOOR: 0.05,
  P_CEIL: 0.45,

  // Stamina
  STAMINA: { MAX: 100, COST_TRAVEL: 1, COST_ROOM: 1, FIELD_REST_RECOVERY: 20 },

  // Streak bias
  STREAK: { NO_AMBUSH_3_BONUS: 0.03, AFTER_AMBUSH_REDUCTION: -0.05 },

  // Safety (distance to town/port)
  SAFETY: { dist1: -0.08, dist2: -0.04, dist3: -0.02 },

  // Depth & environment
  DEPTH_MAX_BONUS: 0.07,
  NIGHT_BONUS: 0.03,
  STORM_BONUS: 0.03,

  // Ambush group sizes by DL (0..5)
  AMBUSH_GROUP_BY_DL: {
    0: [1, 1],
    1: [1, 1],
    2: [1, 2],
    3: [2, 2],
    4: [2, 3],
    5: [3, 3]
  },

  // Biome probability and danger weights (extend as you add biomes)
  BIOME_PROB_DELTA: {
    plains: 0.00, forest: 0.05, desert: 0.07, tropical: 0.05, tundra: 0.06,
    mountains: 0.08, volcanic_rim: 0.10, coast: 0.02, beach: 0.02, wetlands: 0.07, bog: 0.07
  },
  BIOME_DANGER_WEIGHT: {
    plains: 0.05, forest: 0.15, desert: 0.20, tropical: 0.18, tundra: 0.20,
    mountains: 0.25, volcanic_rim: 0.30, wetlands: 0.22, coast: 0.10, beach: 0.10
  },

  // Tiles that open a 4×4 slice
  SLICE_TILETYPES: new Set(["town","port","ruins","dungeon","dense_forest","cave","volcanic_rim"]),
};
