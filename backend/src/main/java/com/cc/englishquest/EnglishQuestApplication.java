package com.cc.englishquest;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * 基于游戏化机制的专升本英语闯关学习系统 —— 启动类
 *
 * @author cc
 */
@SpringBootApplication
@MapperScan("com.cc.englishquest.mapper")
public class EnglishQuestApplication {

    public static void main(String[] args) {
        SpringApplication.run(EnglishQuestApplication.class, args);
    }
}
