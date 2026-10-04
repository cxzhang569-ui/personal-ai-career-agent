# Fictional Projects

## Campus Study Assistant — Overview
Campus Study Assistant 是 Alex Chen 的虚构课程问答项目。它帮助学生从课程资料中寻找有出处的回答，解决手动翻阅讲义耗时、回答无法追溯到原文的问题。

## Campus Study Assistant — Architecture
Markdown 课程资料经过分块，再由本地 BGE 模型生成归一化向量，存入 JSON 索引。问题使用相同模型编码，以 cosine similarity 检索相关片段；将少量片段作为 Context 发送给 DeepSeek，返回回答和 Sources。因此它是检索增强生成（RAG）应用。

## Campus Study Assistant — Challenges
主要难点是重复资料干扰检索与来源归属不清。示例方案将每个事实放在主要章节，用手工标签评估召回；没有证据时说明信息不足，而不是编造。

## Document QA Tool
Document QA Tool 是虚构的 Python 文档问答原型，使用文本清洗、段落切分与来源元数据，让使用者定位支持回答的段落。没有提供实际用户规模或性能收益数据。

## AI Notes Search
AI Notes Search 是虚构的学习笔记搜索工具，比较关键词搜索和语义向量搜索，展示检索片段及章节来源；未宣称上线或商业使用。
