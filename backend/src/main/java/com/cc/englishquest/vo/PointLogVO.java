package com.cc.englishquest.vo;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 一条积分明细（流水）。
 *
 * <p>为什么要单独做一个 VO 而不是直接吐实体：`biz_id` 是内部幂等键
 * （形如 `checkin-2026-11-09`、`ans-VOCAB-3-2026-11-09`），
 * 学生看到只会困惑；明细要的是「什么时候、因为什么、加了几分」三件事。</p>
 */
@Data
public class PointLogVO {

    private Long id;

    /** 积分类型常量，见 {@code PointType} */
    private String type;

    /** 类型的中文名，前端直接显示，不用再维护一份映射 */
    private String typeName;

    /** 变动值。负数表示扣减（对账修正时会用到） */
    private Integer changePoints;

    /** 说明，例如「词汇闯关答题得分」「每日打卡，连续第 3 天」 */
    private String remark;

    private LocalDateTime createTime;
}
