package com.cc.englishquest.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cc.englishquest.entity.VocabQuestion;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface VocabQuestionMapper extends BaseMapper<VocabQuestion> {

    /**
     * 题库里已有的全部中文释义（去重）。
     *
     * <p>批量导入时「自动生成干扰项」用它当候选池：新词的 3 个错误选项
     * 就从这些已有释义里挑，而不是凭空编造 —— 编出来的释义学生一眼就能看出
     * 哪个是凑数的，题目就失去区分度了。</p>
     */
    @Select("SELECT DISTINCT meaning FROM t_vocab_question "
            + "WHERE status = 1 AND meaning IS NOT NULL AND meaning <> ''")
    List<String> selectDistinctMeanings();
}
