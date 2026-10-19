package com.cc.englishquest.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cc.englishquest.common.BizException;
import com.cc.englishquest.entity.ErrorBook;
import com.cc.englishquest.entity.GrammarQuestion;
import com.cc.englishquest.mapper.ErrorBookMapper;
import com.cc.englishquest.mapper.GrammarQuestionMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 错题本服务
 */
@Service
@RequiredArgsConstructor
public class ErrorBookService {

    private final ErrorBookMapper errorBookMapper;
    /** 语法错题用：把 A/B/C/D 还原成选项内容（含历史记录的就地翻译） */
    private final GrammarQuestionMapper grammarQuestionMapper;

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

    /**
     * 语法错题收录：答案一律存选项**内容**，不存 A/B/C/D。
     *
     * <p>为什么不复用上面那个通用 record：语法题的答案是字母，而字母本身没有信息量 ——
     * 错题本上写「上次错答：A / 正确答案：B」，用户既想不起自己选了什么，
     * 也没法和正确答案对照，重练时还要背字母；写「women teachers / woman teachers」
     * 才是能复习的东西。词汇题的答案本来就是单词、听力本来就是整句，不受影响。</p>
     */
    @Transactional(rollbackFor = Exception.class)
    public void recordGrammar(Long userId, GrammarQuestion q, String userAnswer) {
        if (q == null) {
            return;
        }
        record(userId, GrammarService.MODULE, q.getId(),
                q.getKnowledgePoint(), q.getStem(),
                GrammarService.answerText(q, q.getAnswer()),
                GrammarService.answerText(q, userAnswer),
                q.getAnalysis());
    }

    /** 我的错题列表 */
    public List<ErrorBook> list(Long userId, String module, Integer status, String keyword) {
        LambdaQueryWrapper<ErrorBook> wrapper = new LambdaQueryWrapper<ErrorBook>()
                .eq(ErrorBook::getUserId, userId)
                .eq(module != null && !module.isBlank(), ErrorBook::getModule, module)
                .eq(status != null, ErrorBook::getStatus, status)
                .like(keyword != null && !keyword.isBlank(), ErrorBook::getKnowledgePoint, keyword)
                .orderByDesc(ErrorBook::getUpdateTime);
        List<ErrorBook> rows = errorBookMapper.selectList(wrapper);
        translateGrammarAnswers(rows);
        return rows;
    }

    /** 错题重练：答对标记已掌握，答错累加错误次数 */
    @Transactional(rollbackFor = Exception.class)
    public boolean retry(Long id, String userAnswer) {
        ErrorBook entity = errorBookMapper.selectById(id);
        if (entity == null) {
            throw BizException.badRequest("错题记录不存在");
        }
        // 解压出题目：语法题要靠它把字母翻译成内容
        GrammarQuestion gq = loadGrammarQuestion(entity);
        boolean correct;
        if (ListenService.MODULE.equals(entity.getModule())) {
            // 听力听写是整句输入，按词级准确率判定，
            // 否则少敲一个词整句就判错，反馈过于打击人
            correct = ListenService.accuracy(entity.getCorrectAnswer(), userAnswer) >= 0.8;
        } else if (gq != null) {
            // 语法题：正确答案与用户输入都翻译成选项内容再比 ——
            // 用户重练时可以敲 "women teachers"，也可以顺手敲 "B"，两种都认
            String expect = GrammarService.answerText(gq, entity.getCorrectAnswer());
            String actual = GrammarService.answerText(gq, userAnswer);
            correct = !expect.isEmpty() && expect.equalsIgnoreCase(actual);
            if (!expect.isEmpty()) {
                // 顺手把这条记录刷成文本，历史遗留的字母记录重练一次就自愈了
                entity.setCorrectAnswer(expect);
            }
            if (!actual.isEmpty()) {
                userAnswer = actual;
            }
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
        ErrorBook entity = errorBookMapper.selectById(id);
        translateGrammarAnswer(entity);
        return entity;
    }

    /**
     * 批量翻译：列表页一次取回所有相关语法题，避免逐行查库的 N+1。
     * （错题本一屏动辄几十条，N+1 会让接口从几十毫秒涨到几百毫秒）
     */
    private void translateGrammarAnswers(List<ErrorBook> rows) {
        if (rows == null || rows.isEmpty()) {
            return;
        }
        List<Long> ids = rows.stream()
                .filter(e -> GrammarService.MODULE.equals(e.getModule()) && e.getQuestionId() != null)
                .map(ErrorBook::getQuestionId)
                .distinct()
                .toList();
        if (ids.isEmpty()) {
            return;
        }
        Map<Long, GrammarQuestion> byId = new HashMap<>();
        for (GrammarQuestion q : grammarQuestionMapper.selectBatchIds(ids)) {
            byId.put(q.getId(), q);
        }
        for (ErrorBook e : rows) {
            GrammarQuestion q = GrammarService.MODULE.equals(e.getModule())
                    ? byId.get(e.getQuestionId()) : null;
            if (q == null) {
                continue;
            }
            e.setCorrectAnswer(GrammarService.answerText(q, e.getCorrectAnswer()));
            e.setWrongAnswer(GrammarService.answerText(q, e.getWrongAnswer()));
        }
    }

    /** 语法错题里遗留的 A/B/C/D 就地翻成选项内容（只改内存对象，不落库） */
    private void translateGrammarAnswer(ErrorBook entity) {
        GrammarQuestion q = loadGrammarQuestion(entity);
        if (q == null) {
            return;
        }
        entity.setCorrectAnswer(GrammarService.answerText(q, entity.getCorrectAnswer()));
        entity.setWrongAnswer(GrammarService.answerText(q, entity.getWrongAnswer()));
    }

    /** 取出错题对应的语法题；非语法模块、题号缺失或题目已删时返回 null */
    private GrammarQuestion loadGrammarQuestion(ErrorBook entity) {
        if (entity == null || !GrammarService.MODULE.equals(entity.getModule())
                || entity.getQuestionId() == null) {
            return null;
        }
        return grammarQuestionMapper.selectById(entity.getQuestionId());
    }

    private String normalize(String s) {
        return s == null ? "" : s.trim();
    }
}
