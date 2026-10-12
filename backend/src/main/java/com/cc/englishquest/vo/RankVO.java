package com.cc.englishquest.vo;

import lombok.Data;

/**
 * 排行榜条目
 */
@Data
public class RankVO {

    private Integer rank;

    private Long userId;

    private String nickname;

    private String avatar;

    /** 排名依据值（积分或连续天数） */
    private Integer value;

    /** 是否为当前登录用户 */
    private Boolean mine;
}
