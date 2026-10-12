package com.cc.englishquest.vo;

import lombok.Data;

/**
 * 听力关卡视图（含用户进度与解锁状态）
 *
 * 说明：听力关卡同样采用**逐关解锁**——第 1 关默认开放，
 * 第 N 关需第 N-1 关成绩达到及格分方可进入，与词汇、语法闯关保持一致。
 * 已经通过过的关卡不再受解锁链影响，可随时回去重练刷分。
 */
@Data
public class ListenLevelVO {

    private Long id;

    private String name;

    private String difficulty;

    private String description;

    private Integer questionCount;

    private Integer passScore;

    private Integer sortNo;

    /** 语料库句子总数 */
    private Integer bankSize;

    /** 是否锁定（未满足前置解锁条件） */
    private Boolean locked;

    /** 是否已通过 */
    private Boolean passed;

    /** 综合最高分（简单/困难两种模式取高者） */
    private Integer bestScore;
}
