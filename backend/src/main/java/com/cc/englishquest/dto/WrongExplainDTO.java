package com.cc.englishquest.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 错题针对性讲解请求
 */
@Data
public class WrongExplainDTO {

    @NotNull(message = "题目ID不能为空")
    private Long questionId;

    /**
     * 学生实际做出的错误作答。
     *
     * <p>含义随 module 变化：</p>
     * <ul>
     *   <li>GRAMMAR / VOCAB —— 选中的错项，形如 A/B/C/D；</li>
     *   <li>LISTENING —— 学生敲出的整句英文（听力听写没有选项）。</li>
     * </ul>
     *
     * <p><b>为什么不在 DTO 上用 {@code @Pattern} 卡死 A~D</b>：
     * 听力模块的 chosen 是整句文本，写死正则会把它一律拦在门外。
     * 因此这里只做非空与长度校验，A~D 的形状约束挪到 Service 里按 module 判定
     * ——这样错误信息也更准确（能说"选项只能是 A/B/C/D"，而不是笼统的"参数不合规"）。</p>
     */
    @NotBlank(message = "请提供你的错误作答")
    @Size(max = 500, message = "错误作答内容过长")
    private String chosen;

    /**
     * 题目所属模块：GRAMMAR / VOCAB / LISTENING。
     *
     * <p>三个模块的题号各自在各自的表里自增，光有 questionId 无法定位；
     * 老前端不带这个字段，缺省按 GRAMMAR 处理，保持向后兼容。</p>
     */
    @Pattern(regexp = "(?i)GRAMMAR|VOCAB|LISTENING", message = "模块只能是 GRAMMAR、VOCAB 或 LISTENING")
    private String module;
}
