export const appendChoiceIdToHistory = (key: string, id: string) => {
  try {
    const prevIds: string[] = JSON.parse(localStorage.getItem(key) || '[]');
    const index = prevIds.indexOf(id);
    if (index > -1) {
      prevIds.splice(index, 1);
    }
    prevIds.unshift(id);
    localStorage.setItem(key, JSON.stringify(prevIds));
    return prevIds;
  } catch (error) {
    console.error('Failed to update choice history', error);
    return [];
  }
};
