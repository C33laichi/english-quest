package com.cc.englishquest.vo;

import lombok.Data;

/**
 * 后台全局统计
 */
@Data
public class AdminStatsVO {

    private Long userCount;

    private Long activeToday;

    private Long questionCount;

    private Long answerCount;

    private Long aiCallCount;

    private Long vocabLevelCount;

    private Long grammarLessonCount;

    /** 词汇题总数：题库会随批量导入持续增长，必须实时统计，不能写死在前端 */
    private Long vocabQuestionCount;

    /** 语法题总数：同上 */
    private Long grammarQuestionCount;

    private Long todayAnswerCount;
}
