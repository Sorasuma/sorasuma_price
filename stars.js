(function(){
  const container = document.querySelector('.stars');
  if(!container) return;

  const STAR_COUNT = 70;
  const symbols = ['✦','✧','⋆','·'];

  for(let i = 0; i < STAR_COUNT; i++){
    const star = document.createElement('span');
    star.className = 'star' + (Math.random() < 0.12 ? ' accent' : '');
    star.textContent = symbols[Math.floor(Math.random() * symbols.length)];

    star.style.left = Math.random() * 100 + 'vw';
    star.style.top = Math.random() * 100 + 'vh';
    star.style.fontSize = (Math.random() * 10 + 6) + 'px';

    const duration = (Math.random() * 3 + 2).toFixed(2);
    const delay = (Math.random() * 4).toFixed(2);
    star.style.animationDuration = duration + 's';
    star.style.animationDelay = delay + 's';

    container.appendChild(star);
  }
})();
