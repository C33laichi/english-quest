package com.cc.englishquest.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cc.englishquest.common.BizException;
import com.cc.englishquest.entity.ErrorBook;
import com.cc.englishquest.mapper.ErrorBookMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 错题本服务
 */
@Service
@RequiredArgsConstructor
public class ErrorBookService {

    private final ErrorBookMapper errorBookMapper;

    /** 收录错题（同一题重复答错则累加次数） */
    @Transactional(rollbackFor = Exception.class)
    public void record(Long userId, String module, Long questionId, String knowledgePoint,
                       String stem, String correctAnswer, String wrongAnswer, String analysis) {
        ErrorBook exists = errorBookMapper.selectOne(new LambdaQueryWrapper<ErrorBook>()
                .eq(ErrorBook::getUserId, userId)
                .eq(ErrorBook::getModule, module)
                .eq(ErrorBook::getQuestionId, questionId));
        if (exists != null) {
            exists.setWrongTimes(exists.getWrongTimes() + 1);
            exists.setWrongAnswer(wrongAnswer);
            // 解析必须跟着最新的那次作答一起刷新 ——
            // 否则会出现「wrongAnswer 是这次的、analysis 还是上次的」这种自相矛盾的记录。
            // 听力模块尤其明显：解析里带逐词差异，错法一变解析就必须变。
            exists.setAnalysis(analysis);
            exists.setStatus(0);
            exists.setUpdateTime(LocalDateTime.now());
            errorBookMapper.updateById(exists);
            return;
        }
        ErrorBook entity = new ErrorBook();
        entity.setUserId(userId);
        entity.setModule(module);
        entity.setQuestionId(questionId);
        entity.setKnowledgePoint(knowledgePoint);
        entity.setStem(stem);
        entity.setCorrectAnswer(correctAnswer);
        entity.setWrongAnswer(wrongAnswer);
        entity.setAnalysis(analysis);
        entity.setWrongTimes(1);
        entity.setStatus(0);
        entity.setCreateTime(LocalDateTime.now());
        entity.setUpdateTime(LocalDateTime.now());
        errorBookMapper.insert(entity);
    }

    /** 我的错题列表 */
    public List<ErrorBook> list(Long userId, String module, Integer status, String keyword) {
        LambdaQueryWrapper<ErrorBook> wrapper = new LambdaQueryWrapper<ErrorBook>()
                .eq(ErrorBook::getUserId, userId)
                .eq(module != null && !module.isBlank(), ErrorBook::getModule, module)
                .eq(status != null, ErrorBook::getStatus, status)
                .like(keyword != null && !keyword.isBlank(), ErrorBook::getKnowledgePoint, keyword)
                .orderByDesc(ErrorBook::getUpdateTime);
        return errorBookMapper.selectList(wrapper);
    }

    /** 错题重练：答对标记已掌握，答错累加错误次数 */
    @Transactional(rollbackFor = Exception.class)
    public boolean retry(Long id, String userAnswer) {
        ErrorBook entity = errorBookMapper.selectById(id);
        if (entity == null) {
            throw BizException.badRequest("错题记录不存在");
        }
        boolean correct;
        if (ListenService.MODULE.equals(entity.getModule())) {
            // 听力听写是整句输入，按词级准确率判定，
            // 否则少敲一个词整句就判错，反馈过于打击人
            correct = ListenService.accuracy(entity.getCorrectAnswer(), userAnswer) >= 0.8;
        } else {
            correct = normalize(entity.getCorrectAnswer()).equalsIgnoreCase(normalize(userAnswer));
        }
        if (correct) {
            entity.setStatus(1);
        } else {
            entity.setWrongTimes(entity.getWrongTimes() + 1);
            entity.setWrongAnswer(userAnswer);
        }
        entity.setUpdateTime(LocalDateTime.now());
        errorBookMapper.updateById(entity);
        return correct;
    }

    /** 标记已掌握 */
    @Transactional(rollbackFor = Exception.class)
    public void master(Long id) {
        ErrorBook entity = errorBookMapper.selectById(id);
        if (entity == null) {
            throw BizException.badRequest("错题记录不存在");
        }
        entity.setStatus(1);
        entity.setUpdateTime(LocalDateTime.now());
        errorBookMapper.updateById(entity);
    }

    /** 移除错题 */
    @Transactional(rollbackFor = Exception.class)
    public void remove(Long id) {
        errorBookMapper.deleteById(id);
    }

    /** 未掌握错题数 */
    public long countUnmastered(Long userId) {
        return errorBookMapper.selectCount(new LambdaQueryWrapper<ErrorBook>()
                .eq(ErrorBook::getUserId, userId)
                .eq(ErrorBook::getStatus, 0));
    }

    public ErrorBook getById(Long id) {
        return errorBookMapper.selectById(id);
    }

    private String normalize(String s) {
        return s == null ? "" : s.trim();
    }
}
