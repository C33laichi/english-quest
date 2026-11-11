package com.cc.englishquest.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 学习数据统计查询
 */
@Mapper
public interface StatsMapper {

    /** 每日答题量（热力图） */
    @Select("""
            SELECT DATE_FORMAT(create_time, '%Y-%m-%d') AS day, COUNT(*) AS cnt
            FROM t_study_record
            WHERE user_id = #{userId} AND create_time >= #{start}
            GROUP BY day ORDER BY day
            """)
    List<Map<String, Object>> heatmap(@Param("userId") Long userId, @Param("start") LocalDateTime start);

    /** 每日正确率（趋势） */
    @Select("""
            SELECT day, COUNT(*) AS total, SUM(is_correct) AS correct
            FROM (
                SELECT DATE_FORMAT(create_time, '%Y-%m-%d') AS day, is_correct,
                       ROW_NUMBER() OVER (
                           PARTITION BY DATE(create_time), module, question_id ORDER BY id DESC
                       ) AS rn
                FROM t_study_record
                WHERE user_id = #{userId} AND create_time >= #{start}
            ) t
            WHERE rn = 1
            GROUP BY day ORDER BY day
            """)
    List<Map<String, Object>> trend(@Param("userId") Long userId, @Param("start") LocalDateTime start);

    /**
     * 总览：练习次数 / 覆盖题数 / 学习天数。
     *
     * <p>三个指标一次聚合出来，不再把整张表 selectList 进内存再在 Java 里数 ——
     * 记录会随练习次数线性增长，捞全表迟早撑不住。</p>
     */
    @Select("""
            SELECT COUNT(*) AS attempts,
                   COUNT(DISTINCT module, question_id) AS covered,
                   COUNT(DISTINCT DATE(create_time)) AS days
            FROM t_study_record
            WHERE user_id = #{userId}
            """)
    Map<String, Object> overviewStat(@Param("userId") Long userId);

    /**
     * 掌握度（正确率）：每道题只取**最近一次**结果。
     *
     * <p>直接 SUM(is_correct)/COUNT(*) 算出来的是「所有答题动作的对错比」：
     * 同一道题练 10 次、前 6 次都错，会永久留在分母里，数字越练越低。
     * 按题取末次才是「现在这些题你会多少」。</p>
     */
    @Select("""
            SELECT COUNT(*) AS total, SUM(is_correct) AS correct
            FROM (
                SELECT is_correct,
                       ROW_NUMBER() OVER (PARTITION BY module, question_id ORDER BY id DESC) AS rn
                FROM t_study_record
                WHERE user_id = #{userId}
            ) t
            WHERE rn = 1
            """)
    Map<String, Object> mastery(@Param("userId") Long userId);

    /** 语法各阶段掌握度（雷达）—— 同题取末次，与总览口径一致 */
    @Select("""
            SELECT name, COUNT(*) AS total, SUM(is_correct) AS correct
            FROM (
                SELECT gl.stage AS name, sr.is_correct,
                       ROW_NUMBER() OVER (PARTITION BY sr.question_id ORDER BY sr.id DESC) AS rn
                FROM t_study_record sr
                JOIN t_grammar_question gq ON sr.question_id = gq.id
                JOIN t_grammar_lesson gl ON gq.lesson_id = gl.id
                WHERE sr.user_id = #{userId} AND sr.module = 'GRAMMAR'
            ) t
            WHERE rn = 1
            GROUP BY name
            """)
    List<Map<String, Object>> grammarRadar(@Param("userId") Long userId);

    /** 词汇题型掌握度（雷达）—— 同题取末次，与总览口径一致 */
    @Select("""
            SELECT name, COUNT(*) AS total, SUM(is_correct) AS correct
            FROM (
                SELECT CASE vq.type WHEN 'CHOICE' THEN '词汇·词义辨析' ELSE '词汇·拼写' END AS name,
                       sr.is_correct,
                       ROW_NUMBER() OVER (PARTITION BY sr.question_id ORDER BY sr.id DESC) AS rn
                FROM t_study_record sr
                JOIN t_vocab_question vq ON sr.question_id = vq.id
                WHERE sr.user_id = #{userId} AND sr.module = 'VOCAB'
            ) t
            WHERE rn = 1
            GROUP BY name
            """)
    List<Map<String, Object>> vocabRadar(@Param("userId") Long userId);

    /** 今日答题人数（后台统计） */
    @Select("""
            SELECT COUNT(DISTINCT user_id) FROM t_study_record
            WHERE create_time >= #{start}
            """)
    Long activeUsers(@Param("start") LocalDateTime start);
}
