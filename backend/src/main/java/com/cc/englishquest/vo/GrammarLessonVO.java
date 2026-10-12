package com.cc.englishquest.vo;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 语法关卡视图（含用户进度）
 */
@Data
public class GrammarLessonVO {

    private Long id;

    private Integer dayNo;

    private String title;

    private String stage;

    private String mode;

    private Integer questionCount;

    private Integer passScore;

    /** 是否解锁 */
    private Boolean locked;

    private Boolean passed;

    private Integer bestScore;

    private Integer stars;

    private LocalDateTime finishTime;
}
