const buttons = document.querySelectorAll('.menu-btn');

buttons.forEach((button) => {
  button.addEventListener('click', () => {
    console.log(`Acción pendiente: ${button.textContent?.trim()}`);
  });
});
