package com.cc.englishquest.vo;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

/**
 * 等级阶梯项：等级序号 / 称号 / 达到该级所需的累计积分
 *
 * <p>注意不要和 {@link LevelVO} 混淆 —— 那个是「词汇关卡」。
 * 这里描述的是积分等级（英语学徒 → 专升本王者）。</p>
 *
 * <p>存在的意义是让首页的「等级说明」悬浮卡片有唯一数据源：
 * 门槛定义在 {@code PointService.LEVEL_THRESHOLD}，
 * 前端若自己再抄一份，改门槛时必然对不上。</p>
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class LevelStepVO implements Serializable {

    /** 等级序号，从 1 开始 */
    private Integer level;

    /** 等级称号，如「语法游侠」 */
    private String name;

    /** 达到该等级所需的累计积分 */
    private Integer minPoints;
}
