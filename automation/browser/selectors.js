function createPocSelectors(page) {
  return {
    heading: page.getByRole('heading', {
      name: 'Playwright Local Proof of Concept',
    }),
    paragraph: page.getByText('This local page verifies visible browser automation.'),
    changeButton: page.getByRole('button', { name: 'Change message' }),
    status: page.locator('#status-message'),
    messageInput: page.getByRole('textbox', { name: 'Your message' }),
    missingElement: page.getByRole('heading', { name: 'This element does not exist' }),
  };
}

module.exports = { createPocSelectors };
