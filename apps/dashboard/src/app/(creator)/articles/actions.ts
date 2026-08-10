"use server"

import {
  getArticlesAction as rawGetArticles,
  getArticleByIdAction as rawGetArticleById,
  saveArticleAction as rawSaveArticle,
  deleteArticleAction as rawDeleteArticle,
  getCategoriesAction as rawGetCategories,
  saveCategoryAction as rawSaveCategory,
  deleteCategoryAction as rawDeleteCategory,
} from "@qoe/api-client/actions/articles"

export async function getArticlesAction() {
  const res = await rawGetArticles()
  if (!res.ok) throw new Error(res.error.message)
  return res.data
}

export async function getArticleByIdAction(id: string) {
  const res = await rawGetArticleById(id)
  if (!res.ok) throw new Error(res.error.message)
  return res.data
}

export async function saveArticleAction(data: Parameters<typeof rawSaveArticle>[0]) {
  const res = await rawSaveArticle(data)
  if (!res.ok) throw new Error(res.error.message)
  return res.data
}

export async function deleteArticleAction(id: string) {
  const res = await rawDeleteArticle(id)
  if (!res.ok) throw new Error(res.error.message)
  return res.data
}

export async function getCategoriesAction() {
  const res = await rawGetCategories()
  if (!res.ok) throw new Error(res.error.message)
  return res.data
}

export async function saveCategoryAction(data: Parameters<typeof rawSaveCategory>[0]) {
  const res = await rawSaveCategory(data)
  if (!res.ok) throw new Error(res.error.message)
  return res.data
}

export async function deleteCategoryAction(id: string) {
  const res = await rawDeleteCategory(id)
  if (!res.ok) throw new Error(res.error.message)
  return res.data
}
