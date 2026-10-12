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
            SELECT DATE_FORMAT(create_time, '%Y-%m-%d') AS day,
                   COUNT(*) AS total,
                   SUM(is_correct) AS correct
            FROM t_study_record
            WHERE user_id = #{userId} AND create_time >= #{start}
            GROUP BY day ORDER BY day
            """)
    List<Map<String, Object>> trend(@Param("userId") Long userId, @Param("start") LocalDateTime start);

    /** 语法各阶段掌握度（雷达） */
    @Select("""
            SELECT gl.stage AS name, COUNT(*) AS total, SUM(sr.is_correct) AS correct
            FROM t_study_record sr
            JOIN t_grammar_question gq ON sr.question_id = gq.id
            JOIN t_grammar_lesson gl ON gq.lesson_id = gl.id
            WHERE sr.user_id = #{userId} AND sr.module = 'GRAMMAR'
            GROUP BY gl.stage
            """)
    List<Map<String, Object>> grammarRadar(@Param("userId") Long userId);

    /** 词汇题型掌握度（雷达） */
    @Select("""
            SELECT CASE vq.type WHEN 'CHOICE' THEN '词汇·词义辨析' ELSE '词汇·拼写' END AS name,
                   COUNT(*) AS total, SUM(sr.is_correct) AS correct
            FROM t_study_record sr
            JOIN t_vocab_question vq ON sr.question_id = vq.id
            WHERE sr.user_id = #{userId} AND sr.module = 'VOCAB'
            GROUP BY vq.type
            """)
    List<Map<String, Object>> vocabRadar(@Param("userId") Long userId);

    /** 今日答题人数（后台统计） */
    @Select("""
            SELECT COUNT(DISTINCT user_id) FROM t_study_record
            WHERE create_time >= #{start}
            """)
    Long activeUsers(@Param("start") LocalDateTime start);
}
