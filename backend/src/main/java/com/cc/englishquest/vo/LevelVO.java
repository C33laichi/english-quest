package com.cc.englishquest.vo;

import lombok.Data;

/**
 * 词汇关卡视图（含用户进度）
 */
@Data
public class LevelVO {

    private Long id;

    private String name;

    private String difficulty;

    private String description;

    private Integer questionCount;

    private Integer passScore;

    private Integer sortNo;

    /** 是否已解锁 */
    private Boolean locked;

    /** 是否已通过 */
    private Boolean passed;

    /** 最高分 */
    private Integer bestScore;

    /** 星级 0~3 */
    private Integer stars;

    /** 关卡题目总数（题库规模） */
    private Integer bankSize;
}
